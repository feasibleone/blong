/**
 * The single-scheme happy path (PRD R7, R9, R12, R17, R18, R19).
 *
 * The artefact under test is the **observability**, not the transfer: the flow
 * is driven for real (payer → hub → fxp → payee, over HTTP) and every assertion
 * is made against the records the participants actually retained, read back out
 * of their own caches.
 *
 * That rule is the point of this file. The defect Plan 3 exists to close — an
 * emitter that writes `refs.parent` and a service that reads it, with nothing
 * carrying the value between them — stayed green for seven rounds because every
 * consumer test *hand-built* the link it claimed to verify. Nothing here is
 * fabricated: the trace, the flow execution id, the kind and the parent links
 * are read from records the flow emitted, and the one assertion that is about
 * rendering renders those same records with the shipped renderer.
 *
 * The identities asserted here are deliberately kept apart (D1–D4, ruled
 * 2026-09-13). The **trace** is causal correlation and one trace may span more
 * than one flow; the **flow id** is a caller-minted ULID naming exactly one
 * execution and is carried unchanged by every participant in it; the **flow
 * kind** is the deployment's stable process name and the key drift is observed
 * under. A test that only ever bound one of the three could not tell a correct
 * implementation from one that reused another.
 */

import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import t from 'tap';

import {startFlow, type FlowFaults, type FlowHandle, type FlowKind} from '../../flow/flows.ts';
import type {Participant} from '../../flow/participant.ts';
import {cacheRecordIds, openCache} from '../../src/cache.ts';
import type {LogRecord} from '../../src/record.ts';
import {REF_LENGTH, refUri} from '../../src/refs.ts';
import {renderHuman} from '../../src/render.ts';
import {createApp} from '../../src/service/app.ts';
import {LineageIndex} from '../../src/service/lineage.ts';
import {createServiceWriter} from '../../src/service/transport.ts';
import {isUlid} from '../../src/ulid.ts';
import {getWriter, setWriter} from '../../src/writer.ts';

/** The participants of the single-scheme flow, in hop order. */
const PARTICIPANTS = ['payer', 'hub', 'fxp', 'payee'] as const;

/**
 * The participants of the inter-scheme flow, in hop order.
 *
 * The two topologies share the payer, the corridor's provider and the payee; the
 * inter one replaces the scheme-internal hub with the corridor it crosses — the
 * originating scheme's hub A, the proxy, and the receiving scheme's hub B. One
 * provider, not two: the receiving scheme's hub quotes it, and nothing quotes it
 * from the originating side.
 */
const INTER_PARTICIPANTS = ['payer', 'hubA', 'proxy', 'hubB', 'fxp', 'payee'] as const;

/**
 * The participants log to stdout by default, and this file drives sixteen
 * records a run: silence the destination so the flow's own output cannot be
 * mistaken for tap's. The records are still retained in the caches — a writer
 * chooses the destination, not whether the artifact is kept.
 */
const RESTORE_WRITER = getWriter();
t.beforeEach(() => setWriter(null));
t.afterEach(() => setWriter(RESTORE_WRITER));

/** Newest last: the emitter's clock orders a participant's records. */
function byTime(left: LogRecord, right: LogRecord): number {
    return left.time - right.time || left.id.localeCompare(right.id);
}

/** Every record the participant retained, read back out of the store it wrote. */
async function retained(participant: Participant): Promise<LogRecord[]> {
    const dir = participant.cacheDir;
    const cache = await openCache({dir, limit: Number.MAX_SAFE_INTEGER, readOnly: true});
    const records: LogRecord[] = [];
    for (const id of await cacheRecordIds(dir)) {
        const record = await cache.get(id);
        if (record) {
            records.push(record);
        }
    }
    await cache.close();
    return records;
}

interface FlowRun {
    flow: FlowHandle;
    result: {status: number; body: unknown};
    /** Every record every participant retained, in no particular order. */
    records: LogRecord[];
}

/**
 * Drive one real execution of a flow and read back everything it produced.
 *
 * The loggers are flushed before the caches are read because a record's write is
 * queued a tick after the log call returns: without the flush the run's *last*
 * record — often the one worth asserting on — would still be in flight, and the
 * test would be reading a store that is merely younger than the run rather than
 * one the run has finished writing.
 */
async function runFlow(
    fn: (run: FlowRun) => Promise<void>,
    kind: FlowKind = 'single',
    faults?: FlowFaults,
): Promise<void> {
    const cacheDir = await mkdtemp(join(tmpdir(), 'semantic-log-flow-test-'));
    const flow = await startFlow(kind, {cacheDir, faults});
    try {
        const result = await flow.run();
        for (const participant of flow.participants) {
            await participant.logger.flush();
        }
        const records: LogRecord[] = [];
        for (const participant of flow.participants) {
            records.push(...(await retained(participant)));
        }
        await fn({flow, result, records});
    } finally {
        await flow.close();
        await rm(cacheDir, {recursive: true, force: true});
    }
}

/**
 * Walk the payer's parent links from its newest record back to the root, using
 * only what the store retained, and return the chain root-first.
 *
 * A record whose parent is missing from the store ends the walk where it stands:
 * that is exactly the shape a dropped parent link takes, so a broken chain walks
 * shorter than the run did instead of being papered over.
 */
function walkPayerChain(records: LogRecord[]): string[] {
    const byId = new Map<string, LogRecord>(records.map(record => [record.id, record]));
    const payer = records.filter(record => record.service === 'payer').sort(byTime);
    const walked: string[] = [];
    let cursor: LogRecord | undefined = payer[payer.length - 1];
    while (cursor && !walked.includes(cursor.id)) {
        walked.unshift(cursor.id);
        const parent: string | undefined = cursor.refs.parent;
        cursor = parent === undefined ? undefined : byId.get(parent);
    }
    return walked;
}

t.test('the transfer settles and every participant logs in one trace (PRD R7)', async t => {
    await runFlow(async ({flow, result, records}) => {
        t.equal(result.status, 200, 'the transfer settles');
        t.ok(records.length > 0, 'participants produced records');

        const traces = new Set(records.map(record => record.refs.trace));
        t.equal(traces.size, 1, 'one trace spans every participant');
        const trace = [...traces][0];
        t.equal(typeof trace, 'string', 'every retained record carries a trace');
        t.match(
            trace ?? '',
            /^tr-\d+$/,
            'the entry participant minted it — the driver supplied none',
        );

        for (const name of PARTICIPANTS) {
            t.ok(
                records.some(record => record.service === name && record.refs.trace === trace),
                `${name} logged under that same trace`,
            );
        }

        // The one field the payer attaches to its discovery record has to survive
        // at the path the record documents. A call site that wrapped its arguments
        // one level too deep would put it at `fields.fields.payeeCurrency` — stored,
        // greppable nowhere, and invisible to any test that never looked.
        const discovered = records.find(
            record => record.service === 'payer' && record.msg === 'payee found',
        );
        t.equal(
            (discovered?.fields as {payeeCurrency?: string})?.payeeCurrency,
            'EUR',
            'the field the payer records on discovery is top-level, not wrapped',
        );

        // The participant list and the store agree: every participant in the
        // topology contributed, and no record came from anywhere else.
        const services = new Set(records.map(record => record.service));
        t.same(
            [...services].sort(),
            [...PARTICIPANTS].sort(),
            'every participant of the flow logged, and only those did',
        );
        t.equal(
            flow.participants.length,
            PARTICIPANTS.length,
            'the handle reports the same topology',
        );
    });
});

t.test(
    'one execution is one flow id, carried by every participant, and it is not the trace (D1/D3)',
    async t => {
        await runFlow(async ({records}) => {
            const flowIds = new Set(records.map(record => record.flow?.id));
            t.equal(flowIds.size, 1, 'every participant in one execution carries the same flow id');
            const flowId = [...flowIds][0];
            t.ok(isUlid(flowId), 'the flow id is the caller-minted execution ULID');

            const traces = new Set(records.map(record => record.refs.trace));
            t.equal(
                traces.size,
                1,
                'one trace, so the two identities can be compared on the same records',
            );
            t.not(
                flowId,
                [...traces][0],
                'the flow id is a different value from the trace — trace is not the flow',
            );

            const kinds = new Set(records.map(record => record.flow?.kind));
            t.same(
                [...kinds],
                ['transfer.single'],
                'one stable process name: the drift key, not the execution id',
            );
        });
    },
);

t.test(
    'each participant is identifiable and the causal chain is walkable from the records (PRD R7)',
    async t => {
        await runFlow(async ({records}) => {
            for (const name of PARTICIPANTS) {
                t.ok(
                    records.some(record => record.service === name),
                    `${name} logged`,
                );
            }

            const linked = records.filter(record => record.refs.parent !== undefined);
            t.ok(linked.length > 0, 'records carry a parent link');

            const byId = new Set(records.map(record => record.id));
            const dangling = linked
                .filter(record => !byId.has(record.refs.parent as string))
                .map(record => record.id);
            t.same(dangling, [], 'no parent link points at a record the store does not hold');

            const ordered = records
                .filter(record => record.service === 'payer')
                .sort(byTime)
                .map(record => record.id);
            t.same(
                walkPayerChain(records),
                ordered,
                "the payer's records form one chain from its first record to its last",
            );

            // The parent link is not only data: the shipped renderer has to surface
            // it, or the terminal loses the causation the record carries.
            const tip = ordered[ordered.length - 1];
            const parent = records.find(record => record.id === tip)?.refs.parent;
            t.ok(parent, 'the newest payer record names the record that caused it');
            t.match(
                renderHuman(records.find(record => record.id === tip) as LogRecord),
                new RegExp(`p=${parent}`),
                'the parent link renders in the reference group',
            );
        });
    },
);

t.test('references are locally minted and carry a template-id prefix (PRD R19, R12)', async t => {
    await runFlow(async ({records}) => {
        t.ok(records.length > 0, 'there are records to check');
        for (const record of records) {
            t.equal(
                record.refs.record,
                record.id,
                `${record.id}: the record ref is the record's own id`,
            );
            t.ok(
                isUlid(record.refs.record),
                `${record.id}: the record ref is a locally minted ULID`,
            );
            t.equal(
                record.refs.template,
                record.fingerprint?.slice(0, REF_LENGTH),
                `${record.id}: the template ref is the fingerprint prefix`,
            );
            t.ok(
                /^[0-9a-f]{12}$/.test(record.refs.template ?? ''),
                `${record.id}: the template ref is twelve hex characters`,
            );
        }
        t.match(
            refUri('record', records[0].id),
            /^semlog:\/\/r\/[0-9A-Z]{26}$/,
            'the ref URI is dereferenceable',
        );
    });
});

t.test(
    'the records alone reconstruct the chain through the service (PRD R7 acceptance)',
    async t => {
        await runFlow(async ({records}) => {
            const lineage = new LineageIndex();
            const service = createApp({lineage});
            let sink: ReturnType<typeof createServiceWriter> | undefined;
            try {
                const address = await service.listen({port: 0, host: '127.0.0.1'});
                sink = createServiceWriter({url: address});
                for (const record of records) {
                    // The *shipped* sink, not a test-built `IngestEvent`. `toEvent` is the
                    // one mapping from a record to the event the service ingests, and it
                    // is where the parent link has to survive for the chain below to
                    // exist at all — the exact seam the Plan 3 Task 1 review found empty.
                    sink.write(renderHuman(record), record);
                }
                await sink.flush();
                t.equal(sink.failed(), 0, 'every record the flow produced reached the service');

                const fromRecords = walkPayerChain(records);
                const tip = fromRecords[fromRecords.length - 1];
                t.same(
                    lineage.chain(tip).map(node => node.id),
                    fromRecords,
                    'emitter → sink → LineageIndex: the service walks the same chain the records carry',
                );
                t.equal(
                    lineage.rootOf(tip),
                    fromRecords[0],
                    "and it starts at the payer's first record",
                );
                t.same(
                    lineage.traceIds(),
                    [...new Set(records.map(record => record.refs.trace))],
                    'one trace was indexed',
                );
            } finally {
                await sink?.flush();
                await service.close();
            }
        });
    },
);

t.test('the flow runs with no cluster service anywhere (PRD R18 acceptance)', async t => {
    await runFlow(async ({records, result}) => {
        // No `serviceUrl` is passed and no service is running in this process; the
        // transfer settles and every record is still retained locally, which is
        // what makes the service optional rather than required-but-unconfigured.
        t.equal(result.status, 200, 'SC7: the service is optional');
        t.ok(
            records.every(record => record.refs.record === record.id),
            'every record the flow emitted is resolvable from the local store alone',
        );
    });
});

t.test(
    'the inter-scheme flow crosses the proxy in one execution and one trace (PRD R9, R11)',
    async t => {
        await runFlow(async ({flow, result, records}) => {
            t.equal(result.status, 200, 'the cross-border transfer settles');

            // The topology is asserted before anything about its contents: a run
            // that silently fell back to the single-scheme wiring would settle too,
            // and only the participant set tells the two apart.
            const services = new Set(records.map(record => record.service));
            t.same(
                [...services].sort(),
                [...INTER_PARTICIPANTS].sort(),
                'every participant of the inter topology logged, and only those did',
            );
            t.equal(
                flow.participants.length,
                INTER_PARTICIPANTS.length,
                'the handle reports the same topology',
            );

            // The point of Task 5's second identity: the corridor adds hops, and none
            // of them may mint a flow of its own. One execution stays one ULID, and
            // one trace still spans all seven participants.
            const flowIds = new Set(records.map(record => record.flow?.id));
            t.equal(
                flowIds.size,
                1,
                'one execution still means one flow id across the cross-border hop',
            );
            t.ok(isUlid([...flowIds][0]), 'and it is the caller-minted execution ULID');

            const traces = new Set(records.map(record => record.refs.trace));
            t.equal(traces.size, 1, 'seven participants, one trace');
            t.not(
                [...flowIds][0],
                [...traces][0],
                'the flow id is still a different value from the trace',
            );

            const kinds = new Set(records.map(record => record.flow?.kind));
            t.same(
                [...kinds],
                ['transfer.inter'],
                'the inter flow is its own recurring process — its own drift key',
            );

            // R11: the hop Task 5 adds records *why* it routed. The discriminator,
            // the branch taken and the alternative considered all have to be in the
            // record, or the rationale could not be replayed without the source.
            const routed = records.find(
                record =>
                    record.service === 'proxy' && record.msg === 'routing to target ecosystem',
            );
            t.ok(routed, 'the proxy recorded the routing hop it performed');
            t.equal(
                routed?.decision?.discriminator,
                'route-selection',
                'the record names the discriminator consulted',
            );
            t.equal(routed?.decision?.chosen, 'hubB', 'and the branch it took');
            t.same(
                routed?.decision?.candidates,
                ['hubB', 'hold'],
                'and both routes it considered, the one it did not take included',
            );

            // One provider sits on the corridor and the receiving scheme's hub asks it, so
            // the corridor's price is the only price in play: hub A records the rate the
            // crossing produced, and the payer prices that same quote. A hub that settled
            // on a number of its own would agree with nothing the corridor quoted.
            const assembled = records.find(
                record =>
                    record.service === 'hubA' && record.msg === 'cross-scheme quote assembled',
            );
            t.equal(
                assembled?.fields?.rate,
                1.1,
                "the corridor's rate is recorded on the quote hub A assembled",
            );

            const priced = records.find(
                record => record.service === 'payer' && record.msg === 'quote accepted',
            );
            t.equal(priced?.fields?.rate, 1.1, 'and the payer priced the quote it was quoted');

            // The R10 control for the inter topology: the originating scheme holds a
            // liquidity reservation that no record transmits on the happy path, the
            // same way the receiving hub withholds its routing detail.
            const withWithheld = records.filter(record => Array.isArray(record.fields?.withheld));
            t.equal(
                withWithheld.length,
                0,
                'nothing withheld crosses the corridor unless something fails',
            );
        }, 'inter');
    },
);

t.test(
    'an inter-scheme refusal is attributed to the far end and releases the origin hold (PRD R15, R10)',
    async t => {
        await runFlow(
            async ({result, records}) => {
                t.equal(result.status, 502, 'the payer sees the cross-border failure');

                const errors = records.filter(record => record.level === 50);
                t.ok(
                    errors.some(record => record.service === 'payee'),
                    'the failure is attributed to the payee, four hops away across two schemes',
                );
                t.ok(
                    errors.some(record => record.service === 'hubA'),
                    'and the originating scheme recorded the settlement it could not complete',
                );
                const traces = new Set(errors.map(record => record.refs.trace));
                t.equal(
                    traces.size,
                    1,
                    'PRD R15: one incident across the corridor, not one alert per scheme',
                );

                // The consequence of the failure, not the fact of it: the reservation
                // hub A held back is released onto the record that reports the failure.
                const failed = records.find(
                    record =>
                        record.service === 'hubA' &&
                        record.msg === 'inter-scheme settlement failed',
                );
                t.ok(failed, 'hub A recorded the failed settlement');
                const withheld = failed?.fields?.withheld as
                    | Array<{fields?: Record<string, unknown>}>
                    | undefined;
                t.ok(
                    Array.isArray(withheld) && withheld.length > 0,
                    'and released the detail it had withheld',
                );
                t.ok(
                    withheld?.some(entry => entry.fields?.liquidity !== undefined),
                    'the released detail is the liquidity reservation, which never crossed the corridor',
                );
            },
            'inter',
            {blockTransfers: true},
        );
    },
);
