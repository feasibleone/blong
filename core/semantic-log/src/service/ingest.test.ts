import type {InjectOptions} from 'fastify';
import t from 'tap';
import {createApp} from './app.ts';
import {distance} from './centroid.ts';
import {DetectorSuite, type Anomaly} from './detectors.ts';
import {EmbeddingCache} from './embedding.ts';
import {ExemplarStore} from './exemplars.ts';
import {createIngest, FlowDriftHistory, FlowShapes, flowVectorOf} from './ingest.ts';
import {createProvider} from './provider.ts';
import {TemplateRegistry} from './registry.ts';
import {recordKey} from './search.ts';

/** The wire batch the emitter posts, with the single event's fields overridable. */
function batch(overrides: Record<string, unknown> = {}): object {
    return {
        events: [
            {
                id: '01A',
                time: 1000,
                fingerprint: 'ffff0000ffff0000ffff0000ffff0000',
                template: '[LEVEL: ERROR] [SERVICE: hub] [MSG: timeout]',
                service: 'hub',
                level: 50,
                levelName: 'error',
                msg: 'timeout',
                refs: {record: '01A', trace: 'tr-1'},
                ...overrides,
            },
        ],
    };
}

/** A distinct 32-hex fingerprint per template name; its reference is the first 12 characters. */
function fingerprint(name: string): string {
    return `${name}${'0'.repeat(32)}`.slice(0, 32);
}

const REF = {a: 'aaa000000000', b: 'bbb000000000', c: 'ccc000000000', d: 'ddd000000000'};

/**
 * The Crockford base32 alphabet (no `I`, `L`, `O` or `U`), enough to mint
 * distinct valid execution ULIDs for a test's fixtures.
 */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * A valid execution ULID — 26 Crockford base32 characters — distinguished by
 * `n`. Under the flow-identity ruling this value **is** the instance identity:
 * two steps carrying it are the same run, and a duplicate of a completed run
 * carries it too, which is what separates a straggler from a new execution.
 */
function execution(n: number): string {
    return `01ARZ3NDEKTSV4RRFFQ69G5F${CROCKFORD[Math.floor(n / 32) % 32]}${CROCKFORD[n % 32]}`;
}

/**
 * One event of a business flow execution (PRD R9). `run` is the caller-minted
 * execution ULID and `kind` the stable process name drift is keyed by (R6c,
 * D4). Every step of one execution carries the same `run`; two *executions* of
 * one process share a `kind` but carry different `run`s.
 */
function step(
    id: string,
    name: string,
    time: number,
    run: string,
    kind: string,
    status = 'running',
): object {
    return {
        id,
        time,
        fingerprint: fingerprint(name),
        template: `[LEVEL: INFO] [SERVICE: hub] [MSG: ${name}]`,
        service: 'hub',
        level: 30,
        levelName: 'info',
        msg: `${name} step`,
        refs: {record: id, trace: 'tr-flow'},
        flow: {id: run, kind, step: name, index: time, status},
    };
}

/**
 * One execution of a process: the listed steps in order, the last carrying the
 * terminal status. Every step carries the same execution ULID; a later
 * execution of the same process carries a different one.
 */
function flow(
    run: string,
    kind: string,
    names: string[],
    start: number,
    status = 'completed',
): object[] {
    return names.map((name, index) =>
        step(
            `${run}-${start + index}`,
            name,
            start + index,
            run,
            kind,
            index === names.length - 1 ? status : 'running',
        ),
    );
}

/** The same execution with the stable kind removed — an emitter that predates it. */
function kindlessFlow(run: string, names: string[], start: number, status = 'completed'): object[] {
    return flow(run, 'transfer.single', names, start, status).map(event => {
        const candidate = event as {flow: Record<string, unknown>};
        delete candidate.flow.kind;
        return event;
    });
}

/** One completed step whose flow kind is present but not a string — the wire permits it. */
function misTypedKindStep(id: string, name: string, time: number, run: string): object {
    const event = step(id, name, time, run, 'transfer.single', 'completed') as {
        flow: Record<string, unknown>;
    };
    event.flow.kind = 42;
    return event;
}

/** A flow step with no `status` at all — the wire permits it, and it is in flight. */
function stepWithoutStatus(
    id: string,
    name: string,
    time: number,
    run: string,
    kind: string,
): object {
    const event = step(id, name, time, run, kind) as {flow: Record<string, unknown>};
    delete event.flow.status;
    return event;
}

/** A flow step whose declared position differs from its event time, as a real emitter's does. */
function positioned(
    id: string,
    name: string,
    time: number,
    run: string,
    kind: string,
    index: number,
    status = 'running',
): object {
    const event = step(id, name, time, run, kind, status) as {flow: Record<string, unknown>};
    event.flow.index = index;
    return event;
}

/**
 * A `FlowShapes` that records every completed shape, so a test can assert what
 * the route actually observed rather than reconstruct it from the events.
 */
class RecordingShapes extends FlowShapes {
    readonly completed: string[][] = [];

    append(
        flowId: string,
        step: {ref: string; id?: string; index: number | undefined; time: number},
        finished: boolean,
    ): string[] | undefined {
        const shape = super.append(flowId, step, finished);
        if (shape) {
            this.completed.push(shape);
        }
        return shape;
    }
}

t.test('ingest acknowledges without requiring the emitter to wait (PRD R18)', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    const response = await app.inject({method: 'POST', url: '/events', payload: batch()});
    t.equal(response.statusCode, 202);
    t.same(response.json(), {accepted: 1, templates: 1, anomalies: 1, skipped: 0});
});

t.test('a repeated template counts instead of creating a template', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    await app.inject({method: 'POST', url: '/events', payload: batch()});
    await app.inject({method: 'POST', url: '/events', payload: batch({id: '01B', time: 2000})});
    const templates = (await app.inject({method: 'GET', url: '/templates'})).json() as Array<{
        count: number;
    }>;
    t.equal(templates.length, 1);
    t.equal(templates[0].count, 2);
});

t.test('a template exposes its identity without touching records (PRD R4 acceptance)', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    await app.inject({method: 'POST', url: '/events', payload: batch()});
    const response = await app.inject({method: 'GET', url: '/templates/ffff0000ffff'});
    t.equal(response.statusCode, 200);
    const entry = response.json() as {signature: string; count: number; service: string};
    t.equal(entry.service, 'hub');
    t.equal(entry.count, 1);
    t.match(entry.signature, /MSG: timeout/);
});

t.test(
    'exemplars are retained in full for the first N events, then counted only (PRD R13)',
    async t => {
        const app = createApp({embedding: {kind: 'offline', dimension: 16}, exemplarLimit: 2});
        t.teardown(() => app.close());
        for (let i = 0; i < 5; i++) {
            await app.inject({
                method: 'POST',
                url: '/events',
                payload: batch({id: `01${i}`, time: 1000 + i, msg: `msg ${i}`}),
            });
        }
        const entry = (
            await app.inject({method: 'GET', url: '/templates/ffff0000ffff'})
        ).json() as {
            count: number;
            exemplars: string[];
        };
        t.equal(entry.count, 5);
        t.equal(entry.exemplars.length, 2, 'bounded independently of volume');
        const record = await app.inject({method: 'GET', url: `/records/${entry.exemplars[0]}`});
        t.equal(record.statusCode, 200);
        t.match((record.json() as {msg: string}).msg, /msg 0/);
        const pruned = await app.inject({method: 'GET', url: '/records/014'});
        t.equal(pruned.statusCode, 404, 'a non-exemplar is not retrievable');
    },
);

t.test(
    'the embedding provider is called once per distinct template across a batch (PRD R3)',
    async t => {
        const provider = createProvider({kind: 'offline', dimension: 16});
        let calls = 0;
        const cache = new EmbeddingCache({
            dimension: provider.dimension,
            embed: async (text: string) => {
                calls++;
                return provider.embed(text);
            },
        });
        const app = createApp({embedding: {kind: 'offline', dimension: 16}, cache});
        t.teardown(() => app.close());
        for (let i = 0; i < 10; i++) {
            await app.inject({
                method: 'POST',
                url: '/events',
                payload: batch({id: `01${i}`, time: 1000 + i}),
            });
        }
        // Ten events, one template: one embedding for the template, however many times it is
        // seen (SC3) — and one for each of the five records the store keeps, because a record
        // is searchable by what it says (D20). Seven would be the cost of embedding a record
        // per event, which is the model R3 exists to prevent.
        t.equal(calls, 6, 'one for the template, five for the retained exemplars');
        t.equal(cache.size(), 6, 'and the cache holds exactly those six vectors');
    },
);

t.test(
    'a record is embedded when it is retained, and not when it is only counted (D20)',
    async t => {
        // The bound is what keeps the cost model honest: embedding every occurrence would make
        // the provider's work scale with traffic, which is the one thing R3/SC3 forbids. A
        // record the store keeps is searchable by what it says; one it only counted leaves no
        // vector behind.
        const provider = createProvider({kind: 'offline', dimension: 16});
        const cache = new EmbeddingCache(provider);
        const app = createApp({
            embedding: {kind: 'offline', dimension: 16},
            cache,
            exemplarLimit: 1,
        });
        t.teardown(() => app.close());
        await app.inject({method: 'POST', url: '/events', payload: batch({id: '01KEPT'})});
        await app.inject({method: 'POST', url: '/events', payload: batch({id: '01COUNTED'})});

        t.ok(cache.vectorOf(recordKey('01KEPT')) !== undefined, 'the retained record has a vector');
        t.equal(
            cache.vectorOf(recordKey('01COUNTED')),
            undefined,
            'the counted-only record has none',
        );
    },
);

t.test('the embedding signature falls back from template to msg to fingerprint', async t => {
    const provider = createProvider({kind: 'offline', dimension: 16});
    const embedded: string[] = [];
    const cache = new EmbeddingCache({
        dimension: provider.dimension,
        embed: async (text: string) => {
            embedded.push(text);
            return provider.embed(text);
        },
    });
    const app = createApp({embedding: {kind: 'offline', dimension: 16}, cache});
    t.teardown(() => app.close());

    const withMsg = {
        id: 's-1',
        time: 1,
        fingerprint: fingerprint('aaa'),
        msg: 'only a message',
        service: 'hub',
    };
    const bare = {id: 's-2', time: 2, fingerprint: fingerprint('bbb'), service: 'hub'};
    const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {events: [withMsg, bare]},
    });
    t.equal(response.statusCode, 202);
    // The signature is what the provider is asked to embed, so recording the
    // text is the derivation itself, not a proxy for it. Each event contributes two
    // texts: its template's signature, and — because both are retained — the record's
    // own text, which is built from the message, the operation, the service and the
    // signature (D20).
    t.same(
        embedded,
        ['only a message', 'only a message hub', fingerprint('bbb'), 'hub'],
        'a missing template falls back to the msg, and a record with neither falls back to its fingerprint',
    );
});

t.test('a malformed batch is rejected without poisoning the registry', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    const good = {id: '01A', fingerprint: fingerprint('fff'), service: 'hub'};
    const malformed: unknown[] = [
        {events: [{id: 'x'}]},
        {events: [null]},
        {events: [{id: 'x', fingerprint: 'f', service: 1}]},
        {events: [{...good, flow: null}]},
        {events: [{...good, flow: 'nope'}]},
        {events: [{...good, flow: {id: 7}}]},
        {events: [{...good, flow: {kind: 'transfer.single'}}]},
        {events: 'nope'},
        {},
    ];
    for (const payload of malformed) {
        // The declaration stays `unknown[]` on purpose: the point of the case is
        // arbitrary malformed input, so the cast belongs at the inject boundary
        // rather than in the fixture's type.
        const response = await app.inject({
            method: 'POST',
            url: '/events',
            payload: payload as InjectOptions['payload'],
        });
        t.equal(response.statusCode, 400, `rejected: ${JSON.stringify(payload)}`);
        t.match((response.json() as {error: string}).error, /events/);
    }
    const empty = await app.inject({method: 'POST', url: '/events', payload: {events: []}});
    t.equal(empty.statusCode, 202, 'an empty batch is not malformed');
    t.same(empty.json(), {accepted: 0, templates: 0, anomalies: 0, skipped: 0});
    t.equal(
        (await app.inject({method: 'GET', url: '/templates'})).json().length,
        0,
        'nothing from a rejected batch reached the registry',
    );
});

t.test('an unknown template is a 404', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    const response = await app.inject({method: 'GET', url: '/templates/deadbeef0000'});
    t.equal(response.statusCode, 404);
    t.same(response.json(), {error: 'unknown template'});
});

t.test('an injected registry is ingested into and served (the persistence seam)', async t => {
    const registry = new TemplateRegistry();
    const app = createApp({embedding: {kind: 'offline', dimension: 16}, registry});
    t.teardown(() => app.close());
    t.equal((await app.inject({method: 'GET', url: '/templates'})).json().length, 0);
    await app.inject({method: 'POST', url: '/events', payload: batch()});
    t.equal(registry.size(), 1, 'the app ingested into the registry it was given');
    t.equal((await app.inject({method: 'GET', url: '/templates'})).json().length, 1);
});

// --- Flow-level drift (amendment 2026-09-13, PRD R6c) ------------------------

t.test('a flow vector is its shape: same path, same vector; a different path, a distant one', t => {
    const abc = flowVectorOf([REF.a, REF.b, REF.c], 16);
    t.equal(abc.length, 16, 'the vector has the width the caller asked for');
    t.ok(
        distance(abc, flowVectorOf([REF.a, REF.b, REF.c], 16)) < 1e-9,
        'the same path encodes identically',
    );
    // The margins the pipeline tests below rely on, stated where they come
    // from: a hash encoding of two different shapes is not guaranteed to be
    // distant, and these two are far apart at the drift epsilon in use (0.25).
    t.ok(
        distance(abc, flowVectorOf([REF.a, REF.c, REF.b], 16)) > 0.25,
        'a reordered path is a different shape',
    );
    t.ok(
        distance(abc, flowVectorOf([REF.a, REF.b], 16)) > 0.25,
        'a path that lost a step is a different shape',
    );
    t.end();
});

t.test('a flow that returns to a reordered shape drifts, keyed by the kind (PRD R6c)', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());

    const seeded = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {events: flow(execution(1), 'transfer.single', ['aaa', 'bbb', 'ccc'], 1000)},
    });
    t.equal(seeded.statusCode, 202);
    t.equal((seeded.json() as {anomalies: number}).anomalies, 3, 'three templates, each novel');

    // A *second execution of the same process* — a different ULID, the same
    // kind — takes a reordered path. The drift must fire for the right reason:
    // the stable kind now has a second shape observation, and that shape moved.
    const reordered = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {events: flow(execution(2), 'transfer.single', ['aaa', 'ccc', 'bbb'], 2000)},
    });
    t.equal(reordered.statusCode, 202);
    t.equal(
        (reordered.json() as {anomalies: number}).anomalies,
        1,
        'every template is known, so the only anomaly is the process drifting to a new shape',
    );

    const entry = (await app.inject({method: 'GET', url: `/templates/${REF.a}`})).json() as {
        alerts: Record<string, unknown>;
    };
    t.notOk(
        'driftAt' in entry.alerts,
        'drift is not a template property — there is no field that could hold it',
    );
});

t.test('a flow that lost a step drifts too (PRD R6c)', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: {events: flow(execution(1), 'transfer.single', ['aaa', 'bbb', 'ccc'], 1000)},
    });
    const shortened = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {events: flow(execution(2), 'transfer.single', ['aaa', 'bbb'], 2000)},
    });
    t.equal(
        (shortened.json() as {anomalies: number}).anomalies,
        1,
        'a shorter path is a different shape',
    );
});

t.test('a flow that fails still reports its shape (a terminal status ends the flow)', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: {events: flow(execution(1), 'transfer.single', ['aaa', 'bbb', 'ccc'], 1000)},
    });
    const failed = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
            events: flow(execution(2), 'transfer.single', ['aaa', 'ccc', 'bbb'], 2000, 'failed'),
        },
    });
    t.equal(
        (failed.json() as {anomalies: number}).anomalies,
        1,
        'a failed flow is a completed shape',
    );
});

t.test(
    'drift is observed when the flow completes, not while it is in flight (PRD R6c)',
    async t => {
        const app = createApp({embedding: {kind: 'offline', dimension: 16}});
        t.teardown(() => app.close());
        await app.inject({
            method: 'POST',
            url: '/events',
            payload: {events: flow(execution(1), 'transfer.single', ['aaa', 'bbb', 'ccc'], 1000)},
        });

        const midFlight = await app.inject({
            method: 'POST',
            url: '/events',
            payload: {
                events: [
                    step('p-1', 'aaa', 2000, execution(2), 'transfer.single'),
                    step('p-2', 'bbb', 2001, execution(2), 'transfer.single'),
                ],
            },
        });
        t.equal(
            (midFlight.json() as {anomalies: number}).anomalies,
            0,
            'a prefix is not a shape, so nothing was compared while the flow was in flight',
        );

        const completed = await app.inject({
            method: 'POST',
            url: '/events',
            payload: {
                events: [step('p-3', 'ccc', 2002, execution(2), 'transfer.single', 'completed')],
            },
        });
        t.equal(
            (completed.json() as {anomalies: number}).anomalies,
            0,
            'the same completed shape does not drift',
        );
    },
);

t.test('two processes with different shapes keep independent baselines', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
            events: [
                ...flow(execution(1), 'transfer.single', ['aaa', 'bbb'], 1000),
                ...flow(execution(2), 'transfer.bulk', ['bbb', 'aaa'], 1000),
            ],
        },
    });
    t.same(
        response.json(),
        {accepted: 4, templates: 2, anomalies: 2, skipped: 0},
        'two new templates are novel; neither process has an earlier shape of its own to move away from',
    );
});

t.test('the drift baseline lives under the flow kind, and no template is a drift key', async t => {
    const registry = new TemplateRegistry();
    const cache = new EmbeddingCache(createProvider({kind: 'offline', dimension: 16}));
    const detectors = new DetectorSuite({
        drift: {epsilon: 0.25, learningRate: 0.2},
        rate: {windowMs: 60_000, buckets: 5, zThreshold: 4},
    });
    const exemplars = new ExemplarStore({limit: 2});
    const seen: Anomaly[] = [];
    const ingest = createIngest({
        registry,
        cache,
        detectors,
        exemplars,
        onAnomaly: anomaly => seen.push(anomaly),
    });

    await ingest({events: flow(execution(1), 'transfer.single', ['aaa', 'bbb', 'ccc'], 1000)});
    await ingest({events: flow(execution(2), 'transfer.single', ['aaa', 'ccc', 'bbb'], 2000)});

    const drift = seen.filter(anomaly => anomaly.kind === 'drift');
    t.equal(drift.length, 1, 'the second completed shape moved away from the first');
    t.equal(
        drift[0].ref,
        'transfer.single',
        'the anomaly names the process, which is what drifted',
    );
    t.ok((drift[0].magnitude ?? 0) > 0.25, `and carries the distance (${drift[0].magnitude})`);
    t.ok(detectors.centroidOf('transfer.single'), 'the process has a drifting centroid');
    t.equal(detectors.centroidOf(execution(1)), undefined, 'an execution ULID is not a drift key');
    t.equal(detectors.centroidOf(REF.a), undefined, 'no template carries a drift baseline');

    t.equal(
        exemplars.totalRetained(),
        6,
        'three templates, two occurrences each, all retained under the limit',
    );
    t.same(
        exemplars.get(REF.a),
        [`${execution(1)}-1000`, `${execution(2)}-2000`],
        'the store reads back the ids retained for a template, oldest first',
    );
    t.equal(exemplars.recordOf(`${execution(1)}-1000`)?.id, `${execution(1)}-1000`);
    t.equal(
        exemplars.recordOf('never-retained'),
        undefined,
        'a record that was not kept is not retrievable',
    );
    t.same(
        exemplars.get('no-such-template'),
        [],
        'a template that was never seen has retained nothing',
    );
    t.equal(registry.size(), 3);
});

t.test('a rate-shift is stamped on the template it belongs to (PRD R6b)', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    // One occurrence in each of the five baseline windows: a template's rate
    // baseline is its own completed windows, so it has to exist before a surge
    // can be recognised at all.
    for (let window = 0; window < 5; window++) {
        await app.inject({
            method: 'POST',
            url: '/events',
            payload: batch({id: `w${window}`, time: window * 60_000}),
        });
    }
    const baseline = await app.inject({
        method: 'POST',
        url: '/events',
        payload: batch({id: 'q1', time: 300_000}),
    });
    t.equal(
        (baseline.json() as {anomalies: number}).anomalies,
        0,
        'the sixth window opens at the baseline rate',
    );

    const surge = await app.inject({
        method: 'POST',
        url: '/events',
        payload: batch({id: 'q2', time: 300_001}),
    });
    t.equal(
        (surge.json() as {anomalies: number}).anomalies,
        1,
        'a second occurrence in the window is a surge',
    );
    const entry = (await app.inject({method: 'GET', url: '/templates/ffff0000ffff'})).json() as {
        alerts: {rateShiftAt?: number};
    };
    t.equal(
        entry.alerts.rateShiftAt,
        300_001,
        'and the alert is stamped on the template it belongs to',
    );
});

t.test(
    'an anomaly is dispatched by kind, and an unrecordable or unknown one is ignored',
    async t => {
        const registry = new TemplateRegistry();
        const cache = new EmbeddingCache(createProvider({kind: 'offline', dimension: 16}));
        const exemplars = new ExemplarStore({limit: 2});
        const history = new FlowDriftHistory();

        // A drift without a measured distance: the real suite always measures one, so
        // this pins the guard that keeps `undefined` out of `lastDistance`.
        const scripted: Anomaly[][] = [
            [{kind: 'drift', ref: 'transfer.single', time: 1000}],
            // A kind the union does not contain today: it must be ignored, not stamped
            // as a rate-shift, so a future member must be given an explicit home.
            [{kind: 'future-kind' as Anomaly['kind'], ref: 'transfer.single', time: 2000}],
        ];
        let call = 0;
        const detectors = {
            observe: () => {
                const found = scripted[call] ?? [];
                call++;
                return found;
            },
        } as unknown as DetectorSuite;
        const ingest = createIngest({registry, cache, detectors, exemplars, driftHistory: history});

        await ingest(batch());
        t.equal(history.size(), 0, 'a drift with no measured distance is not recorded at all');
        t.same(history.inWindow(0, 9999), [], 'and it appears in no window');

        await ingest(batch({id: '01B', time: 2000}));
        t.equal(
            registry.get('ffff0000ffff')?.alerts.rateShiftAt,
            undefined,
            'an unknown anomaly kind is not mistaken for a rate-shift',
        );
        t.equal(history.size(), 0, 'and it is not recorded as a drift either');
    },
);

t.test(
    'an event that cannot be embedded is skipped and counted, not fatal to the batch',
    async t => {
        const provider = createProvider({kind: 'offline', dimension: 16});
        const cache = new EmbeddingCache({
            dimension: provider.dimension,
            embed: async (text: string) => {
                if (text.includes('boom')) {
                    throw new Error('provider unavailable');
                }
                return provider.embed(text);
            },
        });
        const app = createApp({embedding: {kind: 'offline', dimension: 16}, cache});
        t.teardown(() => app.close());

        const response = await app.inject({
            method: 'POST',
            url: '/events',
            payload: {
                events: [
                    {
                        ...step('s-1', 'aaa', 1000, 'flow-9', 'transfer.single'),
                        template: '[LEVEL: INFO] [SERVICE: hub] [MSG: aaa]',
                    },
                    {
                        ...step('s-2', 'bbb', 1001, 'flow-9', 'transfer.single'),
                        template: '[LEVEL: ERROR] [SERVICE: hub] [MSG: boom]',
                    },
                    {
                        ...step('s-3', 'ccc', 1002, 'flow-9', 'transfer.single'),
                        template: '[LEVEL: INFO] [SERVICE: hub] [MSG: ccc]',
                    },
                ],
            },
        });
        t.equal(response.statusCode, 202, 'one unusable event does not 500 the batch');
        t.same(response.json(), {accepted: 2, templates: 2, anomalies: 2, skipped: 1});
        const refs = (
            (await app.inject({method: 'GET', url: '/templates'})).json() as Array<{ref: string}>
        )
            .map(entry => entry.ref)
            .sort();
        t.same(
            refs,
            [REF.a, REF.c],
            'the skipped event is not registered, and the events after it are',
        );
    },
);

// --- Bounded retention and ordered shapes (review findings 1 and 2) ----------

t.test('a flow shape is ordered by flow position, not by arrival order', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: {events: flow(execution(1), 'transfer.single', ['aaa', 'bbb', 'ccc'], 1000)},
    });

    // The next execution's steps arrive in the reverse of their flow position,
    // terminal last in the batch. The path the flow actually traced is
    // aaa -> bbb -> ccc, so ordering by position must not drift.
    const reordered = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
            events: [
                step('arr-1', 'ccc', 3002, execution(2), 'transfer.single'),
                step('arr-2', 'bbb', 3001, execution(2), 'transfer.single'),
                step('arr-3', 'aaa', 3000, execution(2), 'transfer.single', 'completed'),
            ],
        },
    });
    t.equal(
        (reordered.json() as {anomalies: number}).anomalies,
        0,
        'the same path is the same shape however the steps arrived',
    );
});

t.test(
    'a terminal that settles before an earlier step cannot let the straggler seed a shape',
    async t => {
        const provider = createProvider({kind: 'offline', dimension: 16});
        let release = (): void => {};
        const gate = new Promise<void>(resolve => {
            release = resolve;
        });
        const cache = new EmbeddingCache({
            dimension: provider.dimension,
            embed: async (text: string) => {
                if (text.includes('late')) {
                    await gate;
                }
                return provider.embed(text);
            },
        });
        const shapes = new RecordingShapes(8, 8);
        const app = createApp({embedding: {kind: 'offline', dimension: 16}, cache, shapes});
        t.teardown(() => app.close());

        // A whole execution completes, leaving a baseline shape under its kind. A
        // retransmitted step of *that same execution* — held inside the provider so
        // it lands after the terminal — names a spent ULID, so it must be dropped,
        // not used to seed a second shape under the process.
        const terminal = app.inject({
            method: 'POST',
            url: '/events',
            payload: {events: flow(execution(1), 'transfer.single', ['aaa', 'bbb', 'ccc'], 1000)},
        });
        const late = app.inject({
            method: 'POST',
            url: '/events',
            payload: {events: [step('race-late', 'late', 1001, execution(1), 'transfer.single')]},
        });

        await terminal;
        t.equal(shapes.pending(), 0, 'the terminal closed the execution');
        release();
        await late;
        t.equal(shapes.pending(), 0, 'the late step did not reopen the execution');
        t.equal(shapes.stragglers(), 1, 'the straggler was dropped explicitly, not silently');
        t.same(shapes.completed, [[REF.a, REF.b, REF.c]], 'and seeded no second shape');
    },
);

t.test(
    'a straggler cannot join the next execution even after its first step has arrived',
    async t => {
        const provider = createProvider({kind: 'offline', dimension: 16});
        let release = (): void => {};
        const gate = new Promise<void>(resolve => {
            release = resolve;
        });
        const cache = new EmbeddingCache({
            dimension: provider.dimension,
            embed: async (text: string) => {
                if (text.includes('drifted')) {
                    await gate;
                }
                return provider.embed(text);
            },
        });
        const shapes = new RecordingShapes(8, 8);
        const app = createApp({embedding: {kind: 'offline', dimension: 16}, cache, shapes});
        t.teardown(() => app.close());

        // The first execution leaves a gap at position 1: its middle step never
        // arrived by the time the terminal did, so its shape is aaa -> ccc.
        const first = await app.inject({
            method: 'POST',
            url: '/events',
            payload: {
                events: [
                    positioned('gap-1', 'aaa', 1000, execution(1), 'transfer.single', 0),
                    positioned(
                        'gap-2',
                        'ccc',
                        1002,
                        execution(1),
                        'transfer.single',
                        2,
                        'completed',
                    ),
                ],
            },
        });
        t.equal(first.statusCode, 202);

        // The next execution of the same process begins: a different ULID, so it is
        // tracked independently of the spent one. The delayed middle step of the
        // spent execution is parked inside the provider, so it lands only after the
        // new execution's first step.
        const late = app.inject({
            method: 'POST',
            url: '/events',
            payload: {
                events: [
                    positioned('gap-late', 'drifted', 1001, execution(1), 'transfer.single', 1),
                ],
            },
        });
        const nextFirst = await app.inject({
            method: 'POST',
            url: '/events',
            payload: {
                events: [positioned('gap-3', 'aaa', 2000, execution(2), 'transfer.single', 0)],
            },
        });
        t.equal(
            nextFirst.statusCode,
            202,
            'the next execution began while the delayed step was still in flight',
        );
        t.equal(shapes.stragglers(), 0, 'the delayed step had not landed yet');

        release();
        await late;
        t.equal(
            shapes.stragglers(),
            1,
            'the delayed step was recognised as a straggler of the spent execution',
        );

        // The next execution completes with its own shape; the straggler is in
        // neither shape, because it names the spent execution and is dropped rather
        // than folded into the execution that followed it.
        const nextDone = await app.inject({
            method: 'POST',
            url: '/events',
            payload: {
                events: [
                    positioned('gap-4', 'bbb', 2001, execution(2), 'transfer.single', 1),
                    positioned(
                        'gap-5',
                        'ccc',
                        2002,
                        execution(2),
                        'transfer.single',
                        2,
                        'completed',
                    ),
                ],
            },
        });
        t.equal(nextDone.statusCode, 202);
        t.same(
            shapes.completed,
            [
                [REF.a, REF.c],
                [REF.a, REF.b, REF.c],
            ],
            'the straggler joined neither the gap it belonged to nor the execution that followed it',
        );
        t.equal(shapes.pending(), 0);
    },
);

t.test(
    'an execution that collides with the previous one still drifts (the ULID is the discriminator)',
    async t => {
        const shapes = new RecordingShapes(8, 8);
        const app = createApp({embedding: {kind: 'offline', dimension: 16}, shapes});
        t.teardown(() => app.close());

        // The first execution: aaa -> bbb -> ccc.
        const first = await app.inject({
            method: 'POST',
            url: '/events',
            payload: {events: flow(execution(1), 'transfer.single', ['aaa', 'bbb', 'ccc'], 1000)},
        });
        t.equal(first.statusCode, 202);
        t.equal((first.json() as {anomalies: number}).anomalies, 3, 'three novel templates');

        // The next execution of the same process starts at exactly the previous
        // execution's last event time — a collision time cannot resolve — and takes
        // a shorter path, so the drift can only fire if its shape is observed.
        const second = await app.inject({
            method: 'POST',
            url: '/events',
            payload: {events: flow(execution(2), 'transfer.single', ['aaa', 'bbb'], 1000)},
        });
        t.equal(second.statusCode, 202);
        t.equal(
            (second.json() as {anomalies: number}).anomalies,
            1,
            'the colliding execution completed, and its shortened shape drifted',
        );
        t.same(
            shapes.completed,
            [
                [REF.a, REF.b, REF.c],
                [REF.a, REF.b],
            ],
            'the colliding execution produced its own shape rather than being dropped',
        );
    },
);

t.test('a duplicate of a completed execution fabricates no shape and raises no drift', async t => {
    const shapes = new RecordingShapes(8, 8);
    const app = createApp({embedding: {kind: 'offline', dimension: 16}, shapes});
    t.teardown(() => app.close());

    const run = execution(1);
    const instance = flow(run, 'transfer.single', ['aaa', 'bbb', 'ccc'], 1000);
    const first = await app.inject({method: 'POST', url: '/events', payload: {events: instance}});
    t.equal(first.statusCode, 202);
    t.equal((first.json() as {anomalies: number}).anomalies, 3, 'three novel templates');
    t.same(shapes.completed, [[REF.a, REF.b, REF.c]], 'the execution completed once');

    // The emitter retransmits the terminal event on its own. It carries the
    // completed execution's ULID, so it belongs to that execution and is not the
    // start of the next one.
    const retransmitted = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {events: [step(`${run}-1002`, 'ccc', 1002, run, 'transfer.single', 'completed')]},
    });
    t.equal(retransmitted.statusCode, 202);
    t.same(
        retransmitted.json(),
        {accepted: 1, templates: 3, anomalies: 0, skipped: 0},
        'the duplicate raised nothing — in particular, no drift observation',
    );
    t.same(shapes.completed, [[REF.a, REF.b, REF.c]], 'and fabricated no one-step shape');

    // A whole batch retransmitted is the same case spread over one request.
    const again = await app.inject({method: 'POST', url: '/events', payload: {events: instance}});
    t.same(
        again.json(),
        {accepted: 3, templates: 3, anomalies: 0, skipped: 0},
        'a retransmitted batch is not a new execution either',
    );
    t.same(shapes.completed, [[REF.a, REF.b, REF.c]], 'so it fabricated no shape');
    t.equal(shapes.pending(), 0, 'and left nothing in flight');
    t.equal(shapes.stragglers(), 4, 'every retransmitted step was counted as a straggler');
});

t.test(
    'a flow identity that is not a ULID is counted as an unknown execution, not thrown',
    async t => {
        const shapes = new RecordingShapes(8, 8);
        const app = createApp({embedding: {kind: 'offline', dimension: 16}, shapes});
        t.teardown(() => app.close());

        // An emitter that predates the ULID ruling, or a peer sending nonsense,
        // names no execution this service can place. The identity arrived on the
        // wire, so it is reported by being counted, not thrown (D3): the templates
        // still register and are still novel — only the flow is not observed.
        const first = await app.inject({
            method: 'POST',
            url: '/events',
            payload: {events: flow('flow-legacy', 'transfer.single', ['aaa', 'bbb', 'ccc'], 1000)},
        });
        t.equal(first.statusCode, 202, 'a non-ULID identity does not break ingestion');
        t.same(
            first.json(),
            {accepted: 3, templates: 3, anomalies: 3, skipped: 0},
            'the templates are still registered and novel — only the flow is not observed',
        );
        t.equal(shapes.stragglers(), 3, 'each step named no execution and was counted');
        t.same(shapes.completed, [], 'no shape was taken from an unplaceable identity');
        t.equal(shapes.size(), 0, 'and no state was retained');

        const second = await app.inject({
            method: 'POST',
            url: '/events',
            payload: {events: flow('flow-legacy', 'transfer.single', ['aaa', 'ccc', 'bbb'], 2000)},
        });
        t.same(
            second.json(),
            {accepted: 3, templates: 3, anomalies: 0, skipped: 0},
            'a reordered unplaceable execution is not compared, because nothing about it was observed',
        );
        t.same(shapes.completed, [], 'still no shape');
        t.equal(shapes.pending(), 0, 'and nothing in flight');
        t.equal(
            shapes.kindless(),
            0,
            'an identity that names no execution is a straggler, not a kindless flow',
        );
    },
);

t.test('a flow that never terminates cannot grow its retained shape without limit', t => {
    const shapes = new FlowShapes(4, 3);
    const run = execution(1);
    for (let i = 0; i < 10; i++) {
        t.equal(
            shapes.append(run, {ref: `r${i}`, index: i, time: i}, false),
            undefined,
            'an unfinished shape is never observed',
        );
    }
    t.equal(shapes.pending(), 1, 'the execution is still retained');
    t.equal(shapes.truncations(), 7, 'the oldest steps were dropped rather than accumulated');
    const shape = shapes.append(run, {ref: 'r10', index: 10, time: 10}, true);
    t.same(
        shape,
        ['r8', 'r9', 'r10'],
        'the observed shape is the most recent steps, in position order',
    );
    t.end();
});

t.test(
    'the retained execution count is bounded, and an active execution is not the eviction victim',
    t => {
        const shapes = new FlowShapes(2, 8);
        const long = execution(1);
        const short = execution(2);
        shapes.append(long, {ref: 'a', index: 0, time: 0}, false);
        shapes.append(short, {ref: 'b', index: 0, time: 0}, false);
        shapes.append(long, {ref: 'c', index: 1, time: 1}, false);
        t.equal(shapes.size(), 2, 're-touching an existing execution does not grow the map');
        shapes.append(execution(3), {ref: 'd', index: 0, time: 0}, false);
        t.equal(shapes.size(), 2, 'a new execution is admitted only by evicting one');
        t.ok(shapes.open(long), 'the execution still being emitted to keeps its accumulated shape');
        t.notOk(shapes.open(short), 'the least recently seen execution is the one dropped');
        t.equal(shapes.evictions(), 1);
        t.end();
    },
);

t.test('a kindless note counts an attributed execution, but not an identity that names none', t => {
    const shapes = new FlowShapes(4, 8);
    // An identity that names no execution never reaches a shape, and its step is
    // already counted as a straggler, so it must not be counted kindless as well.
    shapes.noteKindless('flow-legacy');
    t.equal(shapes.kindless(), 0, 'a value that is not a ULID is not a kindless flow');

    shapes.noteKindless(execution(1));
    t.equal(shapes.kindless(), 1, 'an execution ULID whose kind was unusable is counted');
    t.end();
});

t.test('a shape is ordered by flow position, with arrival order breaking a tie', t => {
    const shapes = new FlowShapes(4, 8);
    const run = execution(1);
    shapes.append(run, {ref: 'first', index: 5, time: 5}, false);
    shapes.append(run, {ref: 'second', index: undefined, time: 5}, false);
    const shape = shapes.append(run, {ref: 'third', index: undefined, time: 5}, true);
    t.same(
        shape,
        ['first', 'second', 'third'],
        'a missing index falls back to the event time, and equal positions keep arrival order',
    );
    t.end();
});

t.test('a closed execution is spent: a duplicate cannot reopen it or seed a shape', t => {
    const shapes = new FlowShapes(4, 8);
    const first = execution(1);
    t.same(
        shapes.append(first, {ref: 'a', index: 0, time: 10}, false),
        undefined,
        'the first execution is built while it is in flight',
    );
    t.same(
        shapes.append(first, {ref: 'b', index: 1, time: 11}, true),
        ['a', 'b'],
        'and observed when it terminates',
    );

    // A retransmission carries the closed execution's ULID, so it belongs to
    // that execution and is dropped rather than opening a one-step shape.
    t.equal(
        shapes.append(first, {ref: 'b', index: 1, time: 11}, true),
        undefined,
        'a duplicate terminal does not fabricate a shape',
    );
    t.equal(shapes.stragglers(), 1, 'it is dropped as a step of the spent execution');

    // The next execution of the same process carries a different ULID, so it is
    // observed even though its timestamps and positions repeat the spent one's.
    const second = execution(2);
    t.equal(
        shapes.append(second, {ref: 'a', index: 0, time: 10}, false),
        undefined,
        'the next execution is not confused with the spent one',
    );
    t.same(
        shapes.append(second, {ref: 'c', index: 1, time: 11}, true),
        ['a', 'c'],
        'and its shape is observed even though its positions repeat',
    );
    t.end();
});

t.test('a late step is attributed to its own execution, never to a newer one', t => {
    const shapes = new FlowShapes(4, 8);
    const first = execution(1);
    const second = execution(2);
    // Two executions of one process run at once; the first never terminates, so
    // it stays open and its own late step still has an owner.
    t.equal(
        shapes.append(first, {ref: 'a', index: 0, time: 10}, false),
        undefined,
        'the first execution is built while it is in flight',
    );
    t.equal(
        shapes.append(second, {ref: 'b', index: 0, time: 20}, false),
        undefined,
        'the second opens above it',
    );
    t.equal(
        shapes.append(second, {ref: 'c', index: 1, time: 21}, false),
        undefined,
        'and accumulates its own steps',
    );

    // The first execution's late step arrives while the second is open. Placed
    // by its own ULID, it joins the first execution — the one it belongs to —
    // rather than being dropped or given to the second.
    t.equal(
        shapes.append(first, {ref: 'late', index: 1, time: 11}, false),
        undefined,
        'the older step opens nothing new',
    );
    t.equal(shapes.stragglers(), 0, 'nothing was dropped: the step has an owner');

    // The second completes with only its own steps, so the late step was never
    // folded into the wrong execution...
    t.same(
        shapes.append(second, {ref: 'd', index: 2, time: 22}, true),
        ['b', 'c', 'd'],
        'the second execution took its own shape',
    );
    // ...and the first, when it finally terminates, keeps the step it owned.
    t.same(
        shapes.append(first, {ref: 'e', index: 2, time: 23}, true),
        ['a', 'late', 'e'],
        'the first execution kept the step that belonged to it',
    );
    t.end();
});

t.test('two open executions are tracked independently through the route', async t => {
    const shapes = new RecordingShapes(8, 8);
    const app = createApp({embedding: {kind: 'offline', dimension: 16}, shapes});
    t.teardown(() => app.close());

    // Execution 1: a single in-flight step, never terminated.
    const predecessor = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
            events: [positioned('orphan-1', 'aaa', 1000, execution(1), 'transfer.single', 0)],
        },
    });
    t.equal(predecessor.statusCode, 202);

    // Execution 2 of the same process opens and accumulates two steps; its
    // terminal is still to come.
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
            events: [
                positioned('orphan-2', 'bbb', 2000, execution(2), 'transfer.single', 0),
                positioned('orphan-3', 'ccc', 2001, execution(2), 'transfer.single', 1),
            ],
        },
    });

    // Execution 1's late step arrives after execution 2 has begun. It belongs to
    // execution 1, which is still open, so it is neither dropped nor given to
    // execution 2 — the guarantee the old attempt marker could only approximate.
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
            events: [positioned('orphan-4', 'aaa', 1001, execution(1), 'transfer.single', 1)],
        },
    });
    t.equal(shapes.stragglers(), 0, 'the late step has an owner and is not a straggler');

    const done = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
            events: [
                positioned(
                    'orphan-5',
                    'ddd',
                    2002,
                    execution(2),
                    'transfer.single',
                    2,
                    'completed',
                ),
            ],
        },
    });
    t.equal(done.statusCode, 202);
    t.same(
        shapes.completed,
        [[REF.b, REF.c, REF.d]],
        "execution 2 took its own shape, without execution 1's late step",
    );
    t.equal(
        shapes.open(execution(1)),
        true,
        'execution 1 is still in flight with the step it owned',
    );
});

t.test('a flow with no kind still closes but is not observed for drift', async t => {
    const shapes = new RecordingShapes(8, 8);
    const app = createApp({embedding: {kind: 'offline', dimension: 16}, shapes});
    t.teardown(() => app.close());

    // An emitter that predates the stable kind still ingests: the execution is
    // discriminated by its ULID and closed at its terminal, but with no stable
    // process name there is nothing to observe drift under — the surprise is
    // reported by not being observed, not thrown (D3).
    const first = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {events: kindlessFlow(execution(1), ['aaa', 'bbb', 'ccc'], 1000)},
    });
    t.equal(first.statusCode, 202);
    t.same(
        first.json(),
        {accepted: 3, templates: 3, anomalies: 3, skipped: 0},
        'the templates are still registered and novel',
    );

    const second = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {events: kindlessFlow(execution(2), ['aaa', 'ccc', 'bbb'], 2000)},
    });
    t.same(
        second.json(),
        {accepted: 3, templates: 3, anomalies: 0, skipped: 0},
        'a reordered shape is not compared, because there is no key to compare it under',
    );
    t.same(
        shapes.completed,
        [
            [REF.a, REF.b, REF.c],
            [REF.a, REF.c, REF.b],
        ],
        'the shapes were still taken and closed',
    );
    t.equal(shapes.pending(), 0, 'and both executions are spent');

    // An empty kind is the same as an absent one: no stable name, no drift key.
    const empty = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {events: [step('empty-1', 'aaa', 3000, execution(3), '', 'completed')]},
    });
    t.same(
        empty.json(),
        {accepted: 1, templates: 3, anomalies: 0, skipped: 0},
        'an empty kind is not a drift key either',
    );
    t.equal(
        shapes.kindless(),
        3,
        'each completed execution with no usable kind is counted once, not once per step',
    );

    // A kind of the wrong type is the same condition: a stable name is what
    // drift needs, and a number is not one.
    const mistyped = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {events: [misTypedKindStep('typed-1', 'zzz', 4000, execution(4))]},
    });
    t.same(
        mistyped.json(),
        {accepted: 1, templates: 4, anomalies: 1, skipped: 0},
        'a kind of the wrong type is not a drift key either',
    );
    t.equal(shapes.kindless(), 4, 'and its completed execution is counted too');
});

t.test('a record with no flow leaves no flow state', async t => {
    const shapes = new RecordingShapes(4, 8);
    const app = createApp({embedding: {kind: 'offline', dimension: 16}, shapes});
    t.teardown(() => app.close());
    const response = await app.inject({method: 'POST', url: '/events', payload: batch()});
    t.equal(response.statusCode, 202);
    t.equal(shapes.size(), 0, 'a record with no flow participates in nothing');
    t.equal(shapes.stragglers(), 0, 'and is not mistaken for a step without a home');
    t.equal(
        shapes.kindless(),
        0,
        'and a record with no flow is not a kindless flow — that is normal',
    );
});

t.test('a redelivered step does not repeat in the shape or raise drift (PRD R6c)', async t => {
    const shapes = new RecordingShapes(8, 8);
    const app = createApp({embedding: {kind: 'offline', dimension: 16}, shapes});
    t.teardown(() => app.close());

    const run = execution(1);
    const opening = step(`${run}-1000`, 'aaa', 1000, run, 'transfer.single');
    const first = await app.inject({method: 'POST', url: '/events', payload: {events: [opening]}});
    t.equal(first.statusCode, 202);

    // The emitter retransmits the opening step before the execution terminates.
    // The ULID names the run, not the step, so only the step's own id can tell a
    // redelivery from a second occurrence — and a second `aaa` would make the
    // completed shape a different shape, which is how a redelivery alone could
    // raise drift.
    const again = await app.inject({method: 'POST', url: '/events', payload: {events: [opening]}});
    t.same(
        again.json(),
        {accepted: 1, templates: 1, anomalies: 0, skipped: 0},
        'the redelivery is ingested but adds no second occurrence to the shape',
    );

    await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
            events: [
                step(`${run}-1001`, 'bbb', 1001, run, 'transfer.single'),
                step(`${run}-1002`, 'ccc', 1002, run, 'transfer.single', 'completed'),
            ],
        },
    });
    t.same(
        shapes.completed,
        [[REF.a, REF.b, REF.c]],
        'the shape holds aaa once, in position order',
    );
    t.equal(
        shapes.stragglers(),
        0,
        'a redelivery of a step the execution holds is not a straggler',
    );
    t.equal(shapes.pending(), 0, 'and the execution is still closed by its terminal');
});

t.test('a stream of never-terminating flows stays within the retention bound', async t => {
    const shapes = new FlowShapes(3, 8);
    const app = createApp({embedding: {kind: 'offline', dimension: 16}, shapes});
    t.teardown(() => app.close());
    for (let i = 0; i < 12; i++) {
        const response = await app.inject({
            method: 'POST',
            url: '/events',
            payload: {
                events: [step(`nf-${i}`, `nf${i}`, 1000 + i, execution(i), 'transfer.single')],
            },
        });
        t.equal(response.statusCode, 202);
    }
    t.equal(shapes.size(), 3, 'the retained set holds the cap, not every execution ever seen');
    t.equal(shapes.evictions(), 9, 'the least recently seen executions were dropped');
});

t.test(
    'the retention bounds are configurable, and a short cap does not break ingestion',
    async t => {
        const app = createApp({
            embedding: {kind: 'offline', dimension: 16},
            flowLimit: 2,
            flowStepLimit: 2,
        });
        t.teardown(() => app.close());
        const response = await app.inject({
            method: 'POST',
            url: '/events',
            payload: {events: flow(execution(1), 'transfer.single', ['aaa', 'bbb', 'ccc'], 1000)},
        });
        t.equal(response.statusCode, 202);
        t.same(
            response.json(),
            {accepted: 3, templates: 3, anomalies: 3, skipped: 0},
            'a three-step flow still ingests under a two-step retention cap',
        );
    },
);

t.test('a status this version does not treat as terminal leaves the flow in flight', async t => {
    const shapes = new FlowShapes(8, 8);
    const app = createApp({embedding: {kind: 'offline', dimension: 16}, shapes});
    t.teardown(() => app.close());
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: {events: flow(execution(1), 'transfer.single', ['aaa', 'bbb'], 1000)},
    });

    const probe = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
            events: [
                stepWithoutStatus('st-1', 'aaa', 2000, execution(2), 'transfer.single'),
                step('st-2', 'bbb', 2001, execution(2), 'transfer.single', 'stalled'),
            ],
        },
    });
    t.equal(probe.statusCode, 202);
    t.equal(
        shapes.pending(),
        1,
        'neither an absent status nor a declared non-terminal one ends the execution',
    );

    await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
            events: [step('st-3', 'aaa', 2002, execution(2), 'transfer.single', 'completed')],
        },
    });
    t.equal(shapes.pending(), 0, 'a terminal status ends it');
    t.notOk(shapes.open(execution(2)), 'and the terminated execution is retained only as spent');
});

// --- Failure scope (review finding 3) ---------------------------------------

t.test('a failure after registration is a service defect, not a skipped event', async t => {
    const registry = new TemplateRegistry();
    const cache = new EmbeddingCache(createProvider({kind: 'offline', dimension: 16}));
    const detectors = new DetectorSuite({
        drift: {epsilon: 0.25, learningRate: 0.2},
        rate: {windowMs: 60_000, buckets: 5, zThreshold: 4},
    });
    const exemplars = new ExemplarStore({limit: 2});
    const skipped: string[] = [];
    const ingest = createIngest({
        registry,
        cache,
        detectors,
        exemplars,
        onAnomaly: () => {
            throw new Error('digest unavailable');
        },
        onSkipped: (_error, event) => skipped.push(event.id),
    });

    await t.rejects(
        ingest({
            events: [{id: '01A', time: 1000, fingerprint: fingerprint('fff'), service: 'hub'}],
        }),
        /digest unavailable/,
        'the callback failure surfaces instead of being absorbed as a skip',
    );
    t.equal(registry.size(), 1, 'the event was registered before the callback ran');
    t.equal(exemplars.totalRetained(), 1, 'and it kept its exemplar');
    t.same(skipped, [], 'a registered event is never reported as skipped');
});

t.test('a throwing novelty callback cannot cost the event its exemplar either', async t => {
    const registry = new TemplateRegistry();
    const cache = new EmbeddingCache(createProvider({kind: 'offline', dimension: 16}));
    const detectors = new DetectorSuite({
        drift: {epsilon: 0.25, learningRate: 0.2},
        rate: {windowMs: 60_000, buckets: 5, zThreshold: 4},
    });
    const exemplars = new ExemplarStore({limit: 2});
    const ingest = createIngest({
        registry,
        cache,
        detectors,
        exemplars,
        onTemplateAdded: () => {
            throw new Error('digest unavailable');
        },
    });

    await t.rejects(
        ingest({
            events: [{id: '01B', time: 1000, fingerprint: fingerprint('fff'), service: 'hub'}],
        }),
        /digest unavailable/,
        'the callback failure surfaces instead of being absorbed as a skip',
    );
    t.equal(
        exemplars.totalRetained(),
        1,
        'retention ran before the novelty publication, so the exemplar survived the throwing callback',
    );
});

t.test('the digest reports what changed, not the records themselves (PRD R8)', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    await app.inject({method: 'POST', url: '/events', payload: batch()});
    const body = (await app.inject({method: 'GET', url: '/digest?since=0'})).json() as {
        cursor: number;
        entries: Array<{kind: string}>;
    };
    t.ok(body.cursor > 0);
    t.same(
        body.entries.map(entry => entry.kind),
        ['template-added', 'anomaly', 'exemplar-retained'],
        'a template event yields exactly three deltas',
    );
    const empty = (
        await app.inject({method: 'GET', url: `/digest?since=${body.cursor}`})
    ).json() as {entries: unknown[]};
    t.equal(empty.entries.length, 0, 'polling from the cursor returns nothing new');
});

t.test(
    'a digest poll reads from the start when it cannot read the cursor, and pages on request',
    async t => {
        const app = createApp({embedding: {kind: 'offline', dimension: 16}});
        t.teardown(() => app.close());
        await app.inject({method: 'POST', url: '/events', payload: batch()});
        const rubbish = (
            await app.inject({method: 'GET', url: '/digest?since=not-a-number'})
        ).json() as {
            stats: {retained: number};
            entries: Array<{kind: string}>;
        };
        t.equal(
            rubbish.entries.length,
            3,
            'an unreadable cursor reads from the beginning rather than failing the poll',
        );
        t.equal(rubbish.stats.retained, 3, 'the state of the bound travels with every page');
        const paged = (await app.inject({method: 'GET', url: '/digest?limit=1'})).json() as {
            entries: Array<{kind: string}>;
        };
        t.same(
            paged.entries.map(entry => entry.kind),
            ['template-added'],
            'a query limit caps the entries returned',
        );
        const fresh = (await app.inject({method: 'GET', url: '/digest'})).json() as {
            cursor: number;
            entries: unknown[];
        };
        t.equal(fresh.cursor, 3, 'the cursor is echoed so a consumer need not predict it');
        t.equal(fresh.entries.length, 3, 'and with no query at all the whole window is returned');
    },
);

t.test('an unreadable limit is ignored, not turned into a silently empty page', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    await app.inject({method: 'POST', url: '/events', payload: batch()});
    const body = (await app.inject({method: 'GET', url: '/digest?limit=not-a-number'})).json() as {
        entries: unknown[];
    };
    t.equal(
        body.entries.length,
        3,
        'the rubbish limit is dropped, so the whole window is returned',
    );
});

t.test('a repeated template is a count, not a second delta (PRD R8)', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    await app.inject({method: 'POST', url: '/events', payload: batch()});
    await app.inject({method: 'POST', url: '/events', payload: batch()});
    const body = (await app.inject({method: 'GET', url: '/digest'})).json() as {
        entries: Array<{kind: string; data: unknown}>;
    };
    t.equal(
        body.entries.filter(entry => entry.kind === 'template-added').length,
        1,
        'a count going up is not a change to the set of templates',
    );
    t.equal(
        body.entries.filter(entry => entry.kind === 'anomaly').length,
        1,
        'and novelty is raised once, for the first sighting',
    );
    t.same(
        body.entries.find(entry => entry.kind === 'anomaly')?.data,
        {kind: 'novelty', time: 1000, anomalyRef: 'ffff0000ffff', templateRef: 'ffff0000ffff'},
        'the anomaly delta carries its type, its unambiguously named key and the template it belongs to',
    );
});

t.test('the digest names a drift anomaly by its flow kind, not by a template ref', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: {events: flow(execution(1), 'transfer.single', ['aaa', 'bbb', 'ccc'], 1000)},
    });
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: {events: flow(execution(2), 'transfer.single', ['aaa', 'ccc', 'bbb'], 2000)},
    });
    const body = (await app.inject({method: 'GET', url: '/digest'})).json() as {
        entries: Array<{kind: string; data: {anomalyRef?: string; templateRef?: string}}>;
    };
    const drift = body.entries.find(
        entry => entry.kind === 'anomaly' && entry.data.anomalyRef === 'transfer.single',
    );
    t.ok(drift, 'the drift delta is published');
    t.equal(
        drift?.data.templateRef,
        REF.b,
        'and names the triggering template separately, as a template ref',
    );
});

t.test('the digest carries an exemplar pointer only when the record was kept', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}, exemplarLimit: 1});
    t.teardown(() => app.close());
    await app.inject({method: 'POST', url: '/events', payload: batch()});
    await app.inject({method: 'POST', url: '/events', payload: batch()});
    const body = (await app.inject({method: 'GET', url: '/digest'})).json() as {
        entries: Array<{kind: string}>;
    };
    t.equal(
        body.entries.filter(entry => entry.kind === 'exemplar-retained').length,
        1,
        'an occurrence counted but not retained is not a pointer a consumer can follow',
    );
});

// --- Template and record search (PRD R14, R24) ------------------------------

t.test('search returns templates and retained records, each with its kind (R24)', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    await app.inject({method: 'POST', url: '/events', payload: batch()});

    const query = encodeURIComponent('[LEVEL: ERROR] [SERVICE: hub] [MSG: timeout]');
    const results = (await app.inject({method: 'GET', url: `/search?q=${query}`})).json() as Array<{
        kind: string;
        ref?: string;
        record?: string;
        score: number;
        service: string;
        msg?: string;
    }>;

    // One list, two candidate sets: the template the query *is*, and the record it was
    // retained from. Two endpoints would make a caller merge them by hand (D21).
    t.same(
        results.map(result => result.kind),
        ['template', 'record'],
        'both kinds are returned, and the discriminator says which is which',
    );
    const template = results.find(result => result.kind === 'template');
    t.equal(template?.ref, 'ffff0000ffff', 'the template, by its ref');
    t.equal(template?.score, 1, 'the query is the template signature, so the match is exact');
    const record = results.find(result => result.kind === 'record');
    t.equal(record?.record, '01A', 'the record, by its id');
    t.equal(record?.service, 'hub', 'carrying what a reader needs to recognise it');
    t.equal(record?.msg, 'timeout');
    t.ok(
        (results[0]?.score ?? 0) >= (results[1]?.score ?? 0),
        'and the two halves are merged on the score',
    );
});

t.test('a search with no query is empty, not an error', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    await app.inject({method: 'POST', url: '/events', payload: batch()});

    const response = await app.inject({method: 'GET', url: '/search'});

    t.equal(response.statusCode, 200);
    t.same(response.json(), [], 'no query is no filter, and no filter is nothing to return');
});

t.test('the search limit caps the response', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    await app.inject({method: 'POST', url: '/events', payload: batch()});
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: batch({id: '01B', fingerprint: 'eeee0000eeee0000eeee0000eeee0000'}),
    });

    const query = encodeURIComponent('[LEVEL: ERROR] [SERVICE: hub] [MSG: timeout]');
    const results = (
        await app.inject({method: 'GET', url: `/search?q=${query}&limit=1`})
    ).json() as Array<{
        kind: string;
    }>;

    t.equal(results.length, 1, 'the cap is taken from the query string');
    // Four candidates exist here (two templates, two retained records) and the cap is what
    // cuts them, not the candidate set.
    const all = (await app.inject({method: 'GET', url: `/search?q=${query}`})).json() as unknown[];
    t.equal(all.length, 4, 'and it is a cap on a longer ranking, not the whole of it');
});

t.test(
    'an unreadable search limit falls back to the default, not to no matches (PRD R14)',
    async t => {
        const app = createApp({embedding: {kind: 'offline', dimension: 16}, exemplarLimit: 1});
        t.teardown(() => app.close());
        await app.inject({method: 'POST', url: '/events', payload: batch()});

        const query = encodeURIComponent('[LEVEL: ERROR] [SERVICE: hub] [MSG: timeout]');
        const rubbish = (
            await app.inject({method: 'GET', url: `/search?q=${query}&limit=abc`})
        ).json() as Array<{ref?: string}>;
        t.equal(
            rubbish.length,
            2,
            'a non-numeric limit is dropped rather than slicing the answer to nothing',
        );

        const blank = (
            await app.inject({method: 'GET', url: `/search?q=${query}&limit=`})
        ).json() as Array<{ref?: string}>;
        t.equal(blank.length, 2, 'a blank limit is treated as absent, so the default applies');
    },
);

t.test('a record with no template field is still a search result (R24)', async t => {
    // The signature is what a reader browses by, and an emitter that sends none is not
    // excluded from search for it: the record is ranked by its own text, and the result says
    // `null` where the signature would be rather than inventing one.
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
            events: [
                {
                    id: '01NT',
                    time: 1,
                    fingerprint: fingerprint('nnn'),
                    service: 'hub',
                    msg: 'no signature here',
                },
            ],
        },
    });

    const query = encodeURIComponent('no signature here hub');
    const results = (await app.inject({method: 'GET', url: `/search?q=${query}`})).json() as Array<{
        kind: string;
        signature: string | null;
    }>;
    const record = results.find(result => result.kind === 'record');
    t.equal(record?.signature, null, 'the record is ranked, and reports no signature');
    t.equal(
        typeof results.find(result => result.kind === 'template')?.signature,
        'string',
        'as a template always has one',
    );
});

// --- Deploy diff (PRD R14) --------------------------------------------------

t.test('diff reports what appeared in a window (PRD R14 acceptance)', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    await app.inject({method: 'POST', url: '/events', payload: batch()});

    const body = (await app.inject({method: 'GET', url: '/diff?from=0&to=2000'})).json() as {
        range: {from: number; to: number};
        added: Array<{ref: string}>;
    };

    t.same(body.range, {from: 0, to: 2000}, 'the effective window is echoed back');
    t.equal(
        body.added.length,
        1,
        'PRD R14: "what is new since the last release?" without a query or a rule',
    );
    t.equal(body.added[0].ref, 'ffff0000ffff');
});

t.test('the diff reports a flow kind that drifted inside the window (PRD R14)', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());

    // Two executions of one process with different shapes: the first establishes
    // the baseline (a first observation can never be "drift"), the second moves
    // far enough to be reported. The terminal step of the second execution is at
    // 2002, and that is the time the drift is recorded under.
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: {events: flow(execution(1), 'transfer.single', ['aaa', 'bbb', 'ccc'], 1000)},
    });
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: {events: flow(execution(2), 'transfer.single', ['aaa', 'ccc', 'bbb'], 2000)},
    });

    const inside = (await app.inject({method: 'GET', url: '/diff?from=0&to=3000'})).json() as {
        drifted: Array<{kind: string; lastDriftedAt: number; lastDistance: number; count: number}>;
    };
    t.equal(
        inside.drifted.length,
        1,
        'the bucket is not empty: the ingest really recorded the drift',
    );
    t.equal(
        inside.drifted[0].kind,
        'transfer.single',
        'the key is the flow kind, not a template ref',
    );
    t.equal(
        inside.drifted[0].lastDriftedAt,
        2002,
        'timed by the flow observation that moved the shape',
    );
    t.ok(inside.drifted[0].lastDistance > 0.25, 'and carries the distance the detector measured');
    t.equal(inside.drifted[0].count, 1, 'once, for the one execution that moved');

    const before = (await app.inject({method: 'GET', url: '/diff?from=0&to=2001'})).json() as {
        drifted: unknown[];
    };
    t.same(before.drifted, [], 'a window ending before the drift does not report it');

    const after = (await app.inject({method: 'GET', url: '/diff?from=2003&to=3000'})).json() as {
        drifted: unknown[];
    };
    t.same(after.drifted, [], 'and neither does one starting after it');

    const boundary = (await app.inject({method: 'GET', url: '/diff?from=2002&to=2002'})).json() as {
        drifted: Array<{kind: string}>;
    };
    t.same(
        boundary.drifted.map(drift => drift.kind),
        ['transfer.single'],
        'a drift exactly at both bounds is inside',
    );
});

t.test('the ingest writes the drift history the caller injected (PRD R14)', async t => {
    const driftHistory = new FlowDriftHistory();
    const app = createApp({embedding: {kind: 'offline', dimension: 16}, driftHistory});
    t.teardown(() => app.close());
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: {events: flow(execution(1), 'transfer.single', ['aaa', 'bbb', 'ccc'], 1000)},
    });
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: {events: flow(execution(2), 'transfer.single', ['aaa', 'ccc', 'bbb'], 2000)},
    });

    t.equal(driftHistory.size(), 1, 'one entry for the one kind, however often it drifted');
    t.equal(
        driftHistory.inWindow(0, 3000)[0].kind,
        'transfer.single',
        'and it is this instance the ingest wrote',
    );
});

t.test(
    'an unreadable diff bound falls back rather than returning an all-empty answer (PRD R14)',
    async t => {
        const app = createApp({embedding: {kind: 'offline', dimension: 16}});
        t.teardown(() => app.close());
        await app.inject({method: 'POST', url: '/events', payload: batch()});

        const body = (
            await app.inject({method: 'GET', url: '/diff?from=not-a-number&to=also-not'})
        ).json() as {
            range: {from: number; to: number};
            added: Array<{ref: string}>;
        };

        t.equal(body.range.from, 0, 'an unreadable `from` reads from the beginning');
        t.ok(body.range.to >= 1000, 'an unreadable `to` reaches the present');
        t.equal(
            body.added.length,
            1,
            'the fallback reports what a silently empty diff would have hidden',
        );
    },
);

t.test('a blank diff bound is treated as absent, not as zero (PRD R14)', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    await app.inject({method: 'POST', url: '/events', payload: batch()});

    const body = (await app.inject({method: 'GET', url: '/diff?from=0&to='})).json() as {
        range: {from: number; to: number};
        added: Array<{ref: string}>;
    };

    t.equal(body.range.from, 0, 'the numeric bound is kept');
    t.ok(
        body.range.to >= 1000,
        'a blank `to` reaches the present rather than collapsing the window to zero',
    );
    t.equal(body.added.length, 1, 'the batch just ingested is still inside the window');
});

// --- Facet projection at read time (PRD R16) --------------------------------

t.test('a facet is a projection, and an unknown facet is rejected (PRD R16)', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    await app.inject({method: 'POST', url: '/events', payload: batch()});

    const ops = (
        await app.inject({method: 'GET', url: '/templates/ffff0000ffff?facet=ops'})
    ).json() as Record<string, unknown>;
    t.equal(ops.count, 1);
    t.notOk('fingerprint' in ops, 'the operator view is a projection, not the raw entry');

    const bad = await app.inject({method: 'GET', url: '/templates/ffff0000ffff?facet=finance'});
    t.equal(
        bad.statusCode,
        400,
        'an unknown facet is refused, not silently answered with the raw entry',
    );
    t.same((bad.json() as {facets: string[]}).facets, ['ops', 'diagnostic', 'compliance']);
});

t.test(
    'the diagnostic facet reports the template a retained flow drift is attributed to (PRD R16)',
    async t => {
        const app = createApp({embedding: {kind: 'offline', dimension: 16}});
        t.teardown(() => app.close());
        // Two executions of one process with different shapes. The second's terminal
        // step is `bbb`, so the drift anomaly is attributed to REF.b's template; the
        // first execution also raised *novelty* anomalies naming these templates,
        // which must not read as drift.
        await app.inject({
            method: 'POST',
            url: '/events',
            payload: {events: flow(execution(1), 'transfer.single', ['aaa', 'bbb', 'ccc'], 1000)},
        });
        await app.inject({
            method: 'POST',
            url: '/events',
            payload: {events: flow(execution(2), 'transfer.single', ['aaa', 'ccc', 'bbb'], 2000)},
        });

        const implicated = (
            await app.inject({method: 'GET', url: `/templates/${REF.b}?facet=diagnostic`})
        ).json() as {
            drifted: boolean;
        };
        t.equal(
            implicated.drifted,
            true,
            'the template whose step triggered the drift is reported as implicated',
        );

        const bystander = (
            await app.inject({method: 'GET', url: `/templates/${REF.a}?facet=diagnostic`})
        ).json() as {
            drifted: boolean;
        };
        t.equal(
            bystander.drifted,
            false,
            'a template a novelty anomaly names is not thereby implicated in a drift',
        );
    },
);
