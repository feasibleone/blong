/**
 * The service's HTTP surface: what was observed, drawn and searched.
 *
 * Seven reads and three writes, all over the ledger of declared identifiers and the flow ledger the
 * diagrams are drawn from. The route names are the ones `semantic-log` published — `/templates`,
 * `/flows`, `/search`, `/digest` — because a consumer polling them is a script somebody already
 * wrote; what is gone is everything the dropped machinery used to serve: `/incidents` has no route
 * because there is no incident store, and the `anomaly` and `incident` digest kinds have no
 * producer (see `digest.ts`).
 *
 * ## Why the ingest route persists before it acknowledges
 *
 * A batch is written to the snapshot before the `202`, so an acknowledged record survives a restart
 * (PRD R4). A snapshot write that fails is the *service's* failure and answers 500, never a
 * malformed payload: the batch was valid, and telling the emitter its data was bad would send it
 * looking in the wrong place.
 *
 * ## Why a snapshot the service cannot read does not stop it
 *
 * A telemetry aid that refuses to serve because one cache file is truncated is worse than one that
 * starts fresh and says so. The file is **moved aside**, never deleted — the evidence matters — and
 * the suffix names why: a file from another version is not a broken file, and calling it `.corrupt`
 * would be a lie an operator then has to disprove.
 */

import Fastify, {type FastifyInstance} from 'fastify';
import {rename} from 'node:fs/promises';
import {isUlid} from '../ulid.ts';
import {
    discriminatorsOf,
    modelOfExecution,
    modelOfUnion,
    pointsOf,
    renderSequence,
} from './diagram.ts';
import {DigestLog} from './digest.ts';
import {ExemplarStore} from './exemplars.ts';
import {FACETS, isFacet, project} from './facets.ts';
import {FlowLedger} from './flowLedger.ts';
import {createIngest} from './ingest.ts';
import {SignalLedger, type SignalEntry} from './ledger.ts';
import {LineageIndex} from './lineage.ts';
import {loadSnapshot, saveSnapshot, SnapshotError} from './persistence.ts';
import {deployDiff, searchRecords, searchSignals} from './search.ts';

export interface ServiceOptions {
    /** The observed signals. Omitted, a fresh ledger is used. */
    signals?: SignalLedger;
    /** The per-kind and per-execution flow state the diagrams are drawn from. */
    flows?: FlowLedger;
    /** Retained records, per signal. */
    exemplars?: ExemplarStore;
    /** The change stream a poller follows. */
    digest?: DigestLog;
    /** The causal index the lineage reads. */
    lineage?: LineageIndex;
    /** Full records retained per signal. Default 5. */
    exemplarLimit?: number;
    /** Entries retained in the digest. Default 1000. */
    digestLimit?: number;
    /** The snapshot file the ledger and the unions are saved to. Omitted, the service lives in memory. */
    persistTo?: string;
    /** Fastify's own logger. Off by default, because a service's records are its records. */
    logger?: boolean;
}

function readNumber(value: string | undefined, fallback: number): number {
    if (value === undefined || value.trim() === '') {
        return fallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function createApp(options: ServiceOptions = {}): FastifyInstance {
    const app = Fastify({logger: options.logger ?? false});
    const signals = options.signals ?? new SignalLedger();
    const flows = options.flows ?? new FlowLedger();
    const exemplars = options.exemplars ?? new ExemplarStore({limit: options.exemplarLimit ?? 5});
    const digest = options.digest ?? new DigestLog({limit: options.digestLimit ?? 1000});
    const lineage = options.lineage ?? new LineageIndex();

    const ingest = createIngest({
        ledger: signals,
        exemplars,
        onAccepted: event => {
            // One accepted event produces one lineage node and one flow observation, in the same
            // order, which is what lets both ends of a call be seen by one reader in one order
            // (PRD R22). The batch is then saved by the route below.
            lineage.add(event);
            flows.observe(event);
        },
        onSignalAdded: entry => {
            digest.publish('signal-added', {
                ref: entry.ref,
                service: entry.service,
                declared: entry.declared,
            });
        },
        onExemplar: (entry, id) => {
            digest.publish('exemplar-retained', {ref: entry.ref, record: id});
        },
    });

    const snapshotPath = options.persistTo;
    if (snapshotPath !== undefined) {
        // Restore before the first request: `onReady` is awaited by both `listen` and `inject`, so
        // a service handed a snapshot is never asked a question before it has read it.
        app.addHook('onReady', async () => {
            let restored;
            try {
                restored = await loadSnapshot(snapshotPath);
            } catch (error) {
                const fault = error instanceof SnapshotError ? error.fault : 'corrupt';
                const quarantined = `${snapshotPath}.${fault}`;
                app.log.warn(
                    {err: error, snapshotPath, quarantined},
                    'lukaot: the snapshot could not be used; moving it aside and starting empty',
                );
                try {
                    await rename(snapshotPath, quarantined);
                } catch (moveError) {
                    // The quarantine itself failed (the directory is not writable, say). Booting
                    // still wins — refusing to start over a file we cannot move is the outcome this
                    // rule forbids — but the failure is escalated, because the next save overwrites
                    // the evidence.
                    app.log.error(
                        {err: moveError, snapshotPath, quarantined},
                        'lukaot: the snapshot could not be moved aside; it will be overwritten by the next save',
                    );
                }
                return;
            }
            if (restored === undefined) {
                return;
            }
            // Both are restored *whole*: a snapshot is the state the service had, not an addition
            // to whatever it observed since booting.
            signals.replaceAll(restored.entries);
            flows.restore(restored.kinds);
        });
    }

    /** Write the snapshot as it stands now: the ledger and the unions. */
    const persist = (): Promise<void> =>
        snapshotPath === undefined
            ? Promise.resolve()
            : saveSnapshot(snapshotPath, {entries: signals.list(), kinds: flows.unions()});

    app.get('/health', async () => ({status: 'ok'}));

    app.post('/events', async (request, reply) => {
        try {
            await ingest(request.body);
        } catch (error) {
            return reply.code(400).send({error: (error as Error).message});
        }
        // Persist the batch before acknowledging it (PRD R4). Outside the ingest `try`: the batch
        // is valid, so a snapshot write that fails is the service's failure (Fastify answers 500),
        // never a malformed payload.
        await persist();
        return reply.code(202).send({accepted: true, signals: signals.size()});
    });

    app.get('/templates', async () => signals.list());

    app.get('/templates/:ref', async (request, reply) => {
        const {ref} = request.params as {ref: string};
        const {facet} = request.query as {facet?: string};
        const entry = signals.get(ref);
        if (!entry) {
            return reply.code(404).send({error: 'unknown signal'});
        }
        // No facet is the raw entry. An unknown facet is a 400, not a silent fallback: a silent
        // fallback is how a consumer ends up reading data it did not ask for (see `facets.ts`).
        if (facet === undefined) {
            return entry;
        }
        if (!isFacet(facet)) {
            return reply.code(400).send({error: `unknown facet ${facet}`, facets: FACETS});
        }
        return project(entry, facet);
    });

    /**
     * Retire a signal: the writer behind the `signal-retired` delta, and the reason a poller can rely
     * on that kind arriving.
     *
     * Retention here is an **explicit decision**, not a wall-clock TTL. Retiring does not delete: it
     * stamps `retiredAt`, which is what the deploy diff's `removed` bucket reads, and the entry stays
     * readable — as does the signal's history, because a signal seen again after the stamp clears it.
     */
    app.post('/templates/:ref/retire', async (request, reply) => {
        const {ref} = request.params as {ref: string};
        const entry = signals.get(ref);
        if (!entry) {
            return reply.code(404).send({error: 'unknown signal'});
        }
        if (entry.retiredAt !== undefined) {
            // Already retired, and re-retiring is not a *change*: publishing again would be a delta
            // storm for a polling consumer.
            return entry;
        }
        const retiredAt = Date.now();
        signals.retire(ref, retiredAt);
        digest.publish('signal-retired', {ref: entry.ref, service: entry.service, retiredAt});
        await persist();
        return entry;
    });

    app.get('/records/:id', async (request, reply) => {
        const {id} = request.params as {id: string};
        const record = exemplars.recordOf(id);
        if (!record) {
            return reply.code(404).send({error: 'not retained'});
        }
        return record;
    });

    // What has been observed, per flow kind and per execution (PRD R22/R23). Two reads of one index:
    // the unions are what the kind-level diagram is drawn from, and the summaries are what a caller
    // picks an execution out of. The summaries carry no per-record detail, so a caller asks for the
    // one execution it wants next.
    app.get('/flows', async () => ({
        unions: flows.unions(),
        executions: flows.executions(),
        evictions: flows.evictions(),
        truncations: flows.truncations(),
    }));

    /**
     * The sequence diagram of one flow kind, or of one execution.
     *
     * One route rather than two, because Fastify cannot register the same pattern with two parameter
     * names — and the id's shape is a sound discriminator either way: a flow id is the caller-minted
     * ULID and a kind is a dotted lowercase name, so no reference can be both. What the shape decides
     * is which store is asked, and the two failures stay legible: an execution that was never
     * retained is not a kind nobody has heard of, and telling a caller the wrong one sends it looking
     * in the wrong place.
     */
    app.get('/flows/:reference/diagram', async (request, reply) => {
        const {reference} = request.params as {reference: string};
        if (isUlid(reference)) {
            const execution = flows.executionOf(reference);
            if (execution === undefined) {
                return reply.code(404).send({
                    error: 'flow execution not retained',
                    retained: flows.size(),
                    evictions: flows.evictions(),
                });
            }
            return {
                id: execution.id,
                kind: execution.kind,
                closed: execution.closed,
                observed: {
                    services: execution.services,
                    refs: execution.refs,
                    legs: execution.legs,
                    // The branches and the milestones the run was observed inside (PRD R26/R27).
                    // Names only, like the record's own `progress`.
                    branches: discriminatorsOf(execution.observations),
                    points: pointsOf(execution.observations),
                },
                diagram: renderSequence(modelOfExecution(execution)),
            };
        }
        const union = flows.unionOf(reference);
        if (union === undefined) {
            return reply.code(404).send({error: 'unknown flow kind', kinds: flows.kinds()});
        }
        return {
            kind: union.kind,
            observed: {
                executions: union.executions,
                services: union.services,
                legs: union.legs,
                branches: [
                    ...new Set(
                        union.legs.flatMap(leg =>
                            leg.ends.flatMap(end =>
                                (end.branches ?? []).map(branch => branch.discriminator),
                            ),
                        ),
                    ),
                ],
            },
            diagram: renderSequence(modelOfUnion(union)),
        };
    });

    /**
     * Search over identifiers and retained records, in one list with a `kind` discriminator: a caller
     * asking "where does this show up" wants both "which signal is this like" and "which occurrence
     * looked like this", and two endpoints would make it ask twice and merge by hand.
     *
     * A request without `q` is an empty result rather than an error: the route is a filter, and
     * "search for nothing" is not a malformed request.
     */
    app.get('/search', async request => {
        const {q, limit} = request.query as {q?: string; limit?: string};
        if (!q) {
            return [];
        }
        // The same finite-bound rule as `/diff`: `Number('abc')` is `NaN`, and `slice(0, NaN)` is
        // `[]`, so a malformed limit would read as "no matches" rather than falling back.
        const cap = readNumber(limit, 10);
        const found = searchSignals(signals, q, cap).map(result => ({
            kind: 'signal' as const,
            ref: result.ref,
            score: result.score,
            service: result.entry.service,
            message: result.entry.message ?? null,
            count: result.entry.count,
        }));
        const records = searchRecords(exemplars, q, cap).map(result => ({
            kind: 'record' as const,
            record: result.id,
            score: result.score,
            service: result.event.service,
            signal: result.event.signal,
            message: result.event.message ?? null,
            time: result.event.time,
        }));
        // Merged on the score. Ties need no tie-break: each half arrives totally ordered and `sort`
        // is stable, so a tie keeps the order the halves were concatenated in — signals first, then
        // records — which is the same answer every time.
        return [...found, ...records].sort((a, b) => b.score - a.score).slice(0, cap);
    });

    /**
     * The deploy diff: "what is new since the last release?" answered without a query or a rule, from
     * the ledger's own timestamps. The response carries the effective `range` back, so a caller whose
     * bounds fell back can see which window it actually asked about.
     */
    app.get('/diff', async request => {
        const {from, to} = request.query as {from?: string; to?: string};
        const range = {from: readNumber(from, 0), to: readNumber(to, Date.now())};
        const diff = deployDiff(signals, range);
        const summarise = (entry: SignalEntry): object => ({
            ref: entry.ref,
            service: entry.service,
            message: entry.message ?? null,
            count: entry.count,
        });
        return {
            range,
            added: diff.added.map(summarise),
            removed: diff.removed.map(summarise),
            unchanged: diff.unchanged,
        };
    });

    /**
     * The change stream: a poller asks "what changed since cursor N" and gets the deltas, its own
     * cursor back, and the bound's state. The cursor is echoed so a consumer never has to predict it,
     * and `stats` travels with every page so a consumer that fell behind can see that it did.
     *
     * A query the service cannot read as a number is treated as "from the beginning" / "no cap"
     * rather than failing the poll: the stream is advisory, and a rubbish query string must not deny
     * the deltas it can still have.
     */
    app.get('/digest', async request => {
        const {since, limit} = request.query as {since?: string; limit?: string};
        const cursor = Number(since ?? 0);
        const cap = limit ? Number(limit) : undefined;
        return {
            cursor: digest.latest(),
            stats: digest.stats(),
            entries: digest.read(
                Number.isFinite(cursor) ? cursor : 0,
                cap !== undefined && Number.isFinite(cap) ? cap : undefined,
            ),
        };
    });

    return app;
}
