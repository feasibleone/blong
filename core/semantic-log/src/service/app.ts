/**
 * The cluster service (PRD §4: the central half of the hybrid design).
 *
 * Route handlers are wired here and implemented in their own modules, so every
 * capability added by a later task is one `register` call rather than an edit
 * inside a growing route file.
 *
 * The routes are the service's whole public surface for now: ingesting a batch
 * of template events (R3/R4/R6/R13), reading the registry (R4) raw or through
 * one of the read-time facet projections (R16), reading a retained exemplar
 * (R13), the change stream (R8), template search and the deploy diff (R14), the
 * correlated incidents (R15) and retiring a template
 * (`POST /templates/:ref/retire`, the writer behind R8's retired-template
 * delta). Ingest acknowledges
 * with 202 and tells the emitter nothing else — the emitter must not wait on the
 * service (R18) — while anomalies and incidents travel on the digest (R8)
 * instead of in the response. Only a payload that is not a batch of events fails
 * the request, with 400; an individual event that cannot be ingested is counted
 * in the result's `skipped` and logged.
 *
 * When `persistTo` is configured the **template registry** is restored before
 * the first request and saved after every change (R4). The other state this
 * service holds — digest, lineage, incidents, flow-drift history — is
 * process-lifetime by design; see `persistence.ts`. A snapshot that cannot be
 * read does **not** stop the service: it is quarantined and the registry starts
 * empty, loudly (see `onReady` below and `.github/memory/decision.md`, Task 12).
 */

import {rename} from 'node:fs/promises';
import Fastify, {type FastifyInstance} from 'fastify';
import {DetectorSuite, type Anomaly} from './detectors.ts';
import {DigestLog} from './digest.ts';
import {EmbeddingCache} from './embedding.ts';
import {ExemplarStore} from './exemplars.ts';
import {FACETS, isFacet, project, type FacetAnomaly} from './facets.ts';
import {IncidentStore} from './incidents.ts';
import {FlowDriftHistory, FlowShapes, createIngest, type IngestResult} from './ingest.ts';
import {LineageIndex} from './lineage.ts';
import {loadSnapshot, saveSnapshot} from './persistence.ts';
import {createProvider, type EmbeddingConfig} from './provider.ts';
import {TemplateRegistry, type TemplateEntry} from './registry.ts';
import {deployDiff, searchTemplates} from './search.ts';

export interface ServiceOptions {
    /** Embedding provider selection (PRD R5). */
    embedding?: EmbeddingConfig;
    /**
     * Path to the JSON snapshot of the **template registry** — the one durable
     * artifact this service has (PRD R4). The digest, causal lineage, incident
     * store and flow-drift history are process-lifetime surfaces and are
     * deliberately *not* persisted (see `.github/memory/decision.md`, Task 12).
     * Omitted, the service is entirely in-memory and loses all of its state on
     * restart. An unreadable snapshot is moved aside (`.corrupt`) and the
     * service starts with an empty registry rather than refusing to serve.
     */
    persistTo?: string;
    /** Enable request logging. Off by default so tests stay quiet. */
    logger?: boolean;
    /** Full records retained per template (PRD R13). */
    exemplarLimit?: number;
    /** Injected so tests can count embedding calls (PRD R3). */
    cache?: EmbeddingCache;
    /** Injected so a restarted service can continue from a loaded registry (PRD R4). */
    registry?: TemplateRegistry;
    /** Maximum executions whose shape is retained, open or closed (PRD R6c). */
    flowLimit?: number;
    /** Maximum steps retained per in-flight execution (PRD R6c). */
    flowStepLimit?: number;
    /** Injected so a caller can observe the retention bound. */
    shapes?: FlowShapes;
    /** Injected so a caller can observe or share the per-flow-kind drift history (PRD R14). */
    driftHistory?: FlowDriftHistory;
    /** Injected so a caller can observe or seed the causal lineage the correlation reads (R7/R15). */
    lineage?: LineageIndex;
    /** Injected so a caller can observe or seed the correlated incidents (R15). */
    incidents?: IncidentStore;
    /**
     * Recent anomalies retained for cross-batch correlation (R15); ignored when
     * an `incidents` store is injected, since the store owns its own buffer.
     */
    incidentBufferLimit?: number;
    /** How far apart two anomalies on one trace may be and still merge (R15). */
    incidentWindowMs?: number;
    /**
     * The detector suite, so a deployment can tune the windows to its own clock.
     *
     * The shipped default scores a rate baseline over five completed **60-second**
     * windows, so a caller whose activity happens in milliseconds can never fill
     * that baseline and would never see R6b — the window has to match the
     * timescale of the traffic being scored, which only the caller knows.
     */
    detectors?: DetectorSuite;
}

/** Drift epsilon is a distance, not a similarity: the shapes are unit vectors. */
const DETECTORS = {
    drift: {epsilon: 0.25, learningRate: 0.2},
    rate: {windowMs: 60_000, buckets: 5, zThreshold: 4},
};

/**
 * How far apart two anomalies on one trace may be and still merge into one
 * incident (R15). A single failure's cross-service anomalies surface within
 * seconds to a couple of minutes — the span of one request path — so five
 * minutes is generous without merging two unrelated failures that share a trace
 * id over a long-lived connection. Overridable per service.
 */
const DEFAULT_INCIDENT_WINDOW_MS = 300_000;

/**
 * Read a numeric bound from the query string, falling back when it is absent,
 * blank, or not a finite number. `Number('abc')` is `NaN`, `Number('')` is `0`,
 * and `Number(undefined)` is `NaN` too. A `NaN` bound would make every
 * comparison false — turning the diff into an all-empty answer that looks like
 * "nothing changed" rather than failing or falling back — and a blank bound
 * parsed as `0` would collapse a window to nothing, which is the same
 * silently-wrong answer. A blank value is therefore treated exactly like an
 * omitted one. The same rule the digest applies to its cursor (see `/digest`):
 * an unreadable bound reads the whole history instead of silently hiding it.
 */
function readNumber(value: string | undefined, fallback: number): number {
    if (value === undefined || value.trim() === '') {
        return fallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function createApp(options: ServiceOptions = {}): FastifyInstance {
    const app = Fastify({logger: options.logger ?? false});
    const registry = options.registry ?? new TemplateRegistry();
    const cache = options.cache ?? new EmbeddingCache(createProvider(options.embedding ?? {kind: 'offline', dimension: 64}));
    const detectors = options.detectors ?? new DetectorSuite(DETECTORS);
    const exemplars = new ExemplarStore({limit: options.exemplarLimit ?? 5});
    const digest = new DigestLog({limit: 1000});
    const flowDrift = options.driftHistory ?? new FlowDriftHistory();
    const lineage = options.lineage ?? new LineageIndex();
    const incidents = options.incidents ?? new IncidentStore(options.incidentBufferLimit);
    const incidentWindowMs = options.incidentWindowMs ?? DEFAULT_INCIDENT_WINDOW_MS;
    const ingest = createIngest({
        registry,
        cache,
        detectors,
        exemplars,
        shapes: options.shapes ?? new FlowShapes(options.flowLimit, options.flowStepLimit),
        driftHistory: flowDrift,
        onAnomaly: (anomaly, entry) => {
            // `anomaly.ref` is the flow *kind* for a drift anomaly and the
            // template ref for novelty and rate-shift, so it is republished as
            // `anomalyRef`: a consumer that read it as a template ref would be
            // wrong for drift. `templateRef` is always the template whose event
            // triggered the anomaly (see `digest.ts`).
            const {ref, ...rest} = anomaly;
            digest.publish('anomaly', {...rest, anomalyRef: ref, templateRef: entry.ref});
        },
        onAccepted: event => {
            // The causal index is fed from the ingest rather than the route so a
            // record is present before its own anomaly is published (see
            // `IngestDependencies.onAccepted`); correlation is then correct even
            // when a concurrent batch's anomalies are drained by another request.
            lineage.add(event);
        },
        onTemplateAdded: entry => {
            digest.publish('template-added', {ref: entry.ref, service: entry.service, signature: entry.signature});
        },
        onExemplar: (entry, id) => {
            digest.publish('exemplar-retained', {ref: entry.ref, record: id});
        },
        onSkipped: (error, event) => {
            app.log.warn({err: error, eventId: event.id}, 'semantic-log: skipped an event that could not be ingested');
        },
    });

    // Persistence (PRD R4). The snapshot holds the template registry — this
    // service's durable artifact — and nothing else (see `persistence.ts`).
    const snapshotPath = options.persistTo;
    if (snapshotPath) {
        // Restore before the first request: `onReady` is awaited by both
        // `listen` and `inject`, so a service handed a snapshot is never asked a
        // question before it has read it.
        //
        // A snapshot that cannot be read does **not** fail the service — a
        // deliberate deviation from the brief, ruled 2026-09-13 (see
        // `.github/memory/decision.md`, Task 12). A telemetry service that
        // refuses to serve because one cache file is truncated is worse than one
        // that starts fresh and says so, so the unreadable file is **moved
        // aside**, never deleted (the evidence is kept), and the registry starts
        // empty. Both the quarantine and the empty start are logged; a silent
        // empty start is the failure mode this replaces.
        app.addHook('onReady', async () => {
            let entries: TemplateEntry[];
            try {
                entries = await loadSnapshot(snapshotPath);
            } catch (error) {
                const quarantined = `${snapshotPath}.corrupt`;
                app.log.warn(
                    {err: error, snapshotPath, quarantined},
                    'semantic-log: the registry snapshot could not be read; moving it aside and starting with an empty registry',
                );
                try {
                    await rename(snapshotPath, quarantined);
                } catch (moveError) {
                    // The quarantine itself failed (for example the directory is
                    // not writable). Booting still wins: refusing to start over a
                    // file we cannot move is the outcome this rule forbids. The
                    // failure is reported rather than swallowed, and it is
                    // escalated to `error` because the unreadable file will be
                    // overwritten by the next save — the evidence is then gone.
                    app.log.error(
                        {err: moveError, snapshotPath, quarantined},
                        'semantic-log: the unreadable snapshot could not be moved aside; it will be overwritten by the next save',
                    );
                }
                return;
            }
            if (entries.length) {
                registry.replaceAll(entries);
            }
        });
    }
    // One save per *change*, not per response: only the routes that mutate the
    // registry call this. Saving from the handler rather than from `onResponse`
    // is deliberate — `onResponse` is not awaited by `inject`, so a save there is
    // fire-and-forget and cannot be asserted through the routes; here it is part
    // of the request, and a failure is reported to the caller as a 500. A
    // missing path makes this a no-op, so the mutation routes need no branch.
    const persist: () => Promise<void> = snapshotPath
        ? () => saveSnapshot(snapshotPath, registry.list())
        : () => Promise.resolve();

    app.get('/health', async () => ({status: 'ok'}));

    app.post('/events', async (request, reply) => {
        // The anomalies *this* request raises, owned by this request. The ingest
        // collects them into this array (its optional second argument), so a
        // failure discards exactly this batch's anomalies and cannot touch a
        // concurrent request's — the shared buffer with a failure-time `length = 0`
        // that this replaced would wipe another in-flight request's anomalies.
        const raised: Anomaly[] = [];
        let result: IngestResult;
        try {
            result = await ingest(request.body, raised);
        } catch (error) {
            // The rejected batch's anomalies are discarded with `raised` when this
            // scope unwinds: half a batch is not evidence of anything, and the
            // discard is this request's alone — it cannot lose another request's.
            return reply.code(400).send({error: (error as Error).message});
        }
        // Correlate this batch's anomalies against the lineage the ingest has
        // just fed (R15). Nothing awaits between the ingest's completion and
        // this step, so no anomaly is correlated twice or left behind. It sits
        // *outside* the ingest `try` on purpose: only an unusable payload is a
        // 400, and correlation reads state the ingest has already committed.
        for (const incident of incidents.absorb(raised, lineage, registry, incidentWindowMs)) {
            digest.publish('incident', {
                incidentId: incident.id,
                trace: incident.trace,
                rootCause: incident.rootCause,
                services: incident.services,
                kinds: incident.kinds,
                severity: incident.severity,
                firstAt: incident.firstAt,
                lastAt: incident.lastAt,
            });
        }
        // Persist the batch before acknowledging it (PRD R4). Also outside the
        // ingest `try`: the batch is valid, so a snapshot write that fails is the
        // service's failure (Fastify answers 500), never a malformed payload.
        await persist();
        return reply.code(202).send(result);
    });

    // The correlated incidents (R15): one per trace and burst, with a candidate
    // origin. A read of the accumulated store; the *deltas* travel on `/digest`,
    // so a poller can follow new incidents without re-reading this list.
    app.get('/incidents', async () => incidents.list());

    app.get('/templates', async () => registry.list());

    /**
     * The anomalies the digest still retains, reduced to what a drift
     * attribution reads (R16). Bounded exactly as the digest is (1000 entries):
     * there is deliberately no "anomalies ever seen" store, because a facet read
     * must not be able to grow the service's memory without bound.
     */
    const retainedAnomalies = (): FacetAnomaly[] =>
        digest
            .read(0)
            .filter(entry => entry.kind === 'anomaly')
            .map(entry => entry.data as FacetAnomaly);

    app.get('/templates/:ref', async (request, reply) => {
        const {ref} = request.params as {ref: string};
        const {facet} = request.query as {facet?: string};
        const entry = registry.get(ref);
        if (!entry) {
            return reply.code(404).send({error: 'unknown template'});
        }
        // No facet is the raw entry, as before. An unknown facet is a 400, not a
        // silent fallback to the raw entry: a silent fallback is how a consumer
        // ends up reading data it did not ask for (see `facets.ts`).
        if (facet === undefined) {
            return entry;
        }
        if (!isFacet(facet)) {
            return reply.code(400).send({error: `unknown facet ${facet}`, facets: FACETS});
        }
        // A `diagnostic` read is handed the anomalies the digest still retains,
        // so `drifted` can be derived (see `facets.ts`); the other facets ignore
        // it. The collection is bounded by the digest's own cap by construction.
        return project(entry, facet, retainedAnomalies());
    });

    /**
     * Retire a template (PRD R8): the writer behind the `template-retired`
     * delta, and the reason a digest poller can rely on that kind arriving.
     * Retention here is an **explicit decision**, not a wall-clock TTL — see
     * `.github/memory/decision.md` (Task 12) for why a `lastSeen` sweep was
     * rejected. Retiring does not delete: it stamps `retiredAt`, which is what
     * the deploy diff's `removed` bucket reads (R14), and the entry stays
     * readable.
     */
    app.post('/templates/:ref/retire', async (request, reply) => {
        const {ref} = request.params as {ref: string};
        const entry = registry.get(ref);
        if (!entry) {
            return reply.code(404).send({error: 'unknown template'});
        }
        if (entry.retiredAt !== undefined) {
            // Already retired, and re-retiring is not a *change*: publishing
            // again would be a delta storm for a polling consumer. The same rule
            // the incident store keeps (see `incidents.ts`).
            return entry;
        }
        const retiredAt = Date.now();
        registry.retire(ref, retiredAt);
        digest.publish('template-retired', {ref: entry.ref, service: entry.service, retiredAt});
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

    // Template-level semantic search (R14). A request without `q` is an empty
    // result rather than an error: the route is a filter, and "search for
    // nothing" is not a malformed request. The query text is embedded through
    // the same cache as a template, under a `query:`-prefixed key, so a repeated
    // query costs nothing and can never collide with a fingerprint.
    app.get('/search', async request => {
        const {q, limit} = request.query as {q?: string; limit?: string};
        if (!q) {
            return [];
        }
        const vector = await cache.vectorFor(`query:${q}`, q);
        // The same finite-bound rule as `/diff`: `Number('abc')` is `NaN`, and
        // `slice(0, NaN)` is `[]`, so a malformed limit would read as "no
        // matches" rather than falling back to the default.
        return searchTemplates(registry, vector, readNumber(limit, 10)).map(result => ({
            ref: result.ref,
            score: Number(result.score.toFixed(6)),
            service: result.entry.service,
            signature: result.entry.signature,
            count: result.entry.count,
        }));
    });

    // The deploy diff (R14): "what is new since the last release?" answered
    // without a query or a rule, from the registry (added/removed) and the
    // flow-drift history (drifted). `drifted` is keyed by flow **kind**, never by
    // template: a template's embedding is keyed by the fingerprint that
    // identifies it, so it is constant and can never drift (R6c, D4). The
    // response carries the effective `range` back, so a caller whose bounds fell
    // back can see which window it actually asked about.
    app.get('/diff', async request => {
        const {from, to} = request.query as {from?: string; to?: string};
        const range = {from: readNumber(from, 0), to: readNumber(to, Date.now())};
        const diff = deployDiff(registry, range, flowDrift);
        const summarise = (entry: TemplateEntry): object => ({
            ref: entry.ref,
            service: entry.service,
            signature: entry.signature,
            count: entry.count,
        });
        return {
            range,
            added: diff.added.map(summarise),
            removed: diff.removed.map(summarise),
            drifted: diff.drifted,
            unchanged: diff.unchanged,
        };
    });

    // The change stream (R8): a poller asks "what changed since cursor N" and
    // gets the deltas, its own cursor back, and the bound's state. The cursor is
    // echoed so a consumer never has to predict it, and `stats` is returned with
    // every page so a consumer that fell behind can see that it did — the bound
    // tells rather than silently truncates. A query the service cannot read as a
    // number is treated as "from the beginning" / "no cap" rather than failing
    // the poll: the stream is advisory, and a rubbish query string must not deny
    // the deltas it can still have. All five `DigestKind`s are now published,
    // four from this file (`template-added`, `anomaly`, `incident`,
    // `exemplar-retained`) and `template-retired` from the retirement route
    // above, so a poller may wait on any of them (see `digest.ts`).
    app.get('/digest', async request => {
        const {since, limit} = request.query as {since?: string; limit?: string};
        const cursor = Number(since ?? 0);
        const cap = limit ? Number(limit) : undefined;
        return {
            cursor: digest.latest(),
            stats: digest.stats(),
            // An unreadable `limit` is dropped (no cap) rather than passed on as
            // `NaN`, which `slice` treats as 0 and would return an empty page.
            entries: digest.read(
                Number.isFinite(cursor) ? cursor : 0,
                cap !== undefined && Number.isFinite(cap) ? cap : undefined,
            ),
        };
    });

    return app;
}
