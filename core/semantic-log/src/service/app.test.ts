import {mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import t from 'tap';
import {createApp, type ServiceOptions} from './app.ts';
import {EmbeddingCache} from './embedding.ts';
import {FlowLedger} from './flowLedger.ts';
import {IncidentStore} from './incidents.ts';
import {LineageIndex, type LineageNode} from './lineage.ts';
import {createProvider} from './provider.ts';
import type {IngestEvent} from './registry.ts';

t.test('the service answers a health probe without any configuration', async t => {
    const app = createApp();
    t.teardown(() => app.close());
    const response = await app.inject({method: 'GET', url: '/health'});
    t.equal(response.statusCode, 200);
    t.same(response.json(), {status: 'ok'});
});

t.test('an unknown route is a 404, not a crash', async t => {
    const app = createApp();
    t.teardown(() => app.close());
    const response = await app.inject({method: 'GET', url: '/nope'});
    t.equal(response.statusCode, 404);
});

t.test('ingest is not required for the service to be healthy', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 32}});
    t.teardown(() => app.close());
    t.equal((await app.inject({method: 'GET', url: '/health'})).statusCode, 200);
});

// --- incident correlation wiring (R15) -------------------------------------

interface StepInput {
    id: string;
    time: number;
    fingerprint: string;
    service: string;
    parent?: string;
}

/** A batch of one trace's records, a record optionally parented by an earlier one. */
function events(steps: StepInput[], traceId: string): object {
    return {
        events: steps.map(step => ({
            id: step.id,
            time: step.time,
            fingerprint: step.fingerprint,
            template: `[MSG: ${step.service}]`,
            service: step.service,
            refs: {record: step.id, trace: traceId, ...(step.parent ? {parent: step.parent} : {})},
        })),
    };
}

t.test('a batch spanning services on one trace yields ONE incident (R15)', async t => {
    const app = createApp();
    t.teardown(() => app.close());
    t.same(
        (await app.inject({method: 'GET', url: '/incidents'})).json(),
        [],
        'nothing is correlated before any ingest',
    );

    const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: events(
            [
                {id: 'tr-1-payer', time: 10, fingerprint: 'fp-payer', service: 'payer'},
                {
                    id: 'tr-1-hub',
                    time: 11,
                    fingerprint: 'fp-hub',
                    service: 'hub',
                    parent: 'tr-1-payer',
                },
                {
                    id: 'tr-1-payee',
                    time: 12,
                    fingerprint: 'fp-payee',
                    service: 'payee',
                    parent: 'tr-1-hub',
                },
            ],
            'tr-1',
        ),
    });
    t.equal(response.statusCode, 202);

    const incidents = (await app.inject({method: 'GET', url: '/incidents'})).json() as Array<{
        trace: string;
        rootCause: string;
        services: string[];
        severity: number;
    }>;
    t.equal(incidents.length, 1, 'not one alert per service');
    t.equal(incidents[0].trace, 'tr-1');
    t.equal(incidents[0].rootCause, 'tr-1-payer', 'the record closest to the trace root');
    t.same([...incidents[0].services].sort(), ['hub', 'payee', 'payer']);
    t.equal(incidents[0].severity, 4, 'three services and one kind');

    const digest = (await app.inject({method: 'GET', url: '/digest?since=0'})).json() as {
        entries: Array<{kind: string}>;
    };
    t.ok(
        digest.entries.some(entry => entry.kind === 'incident'),
        'the incident delta a poller waits for genuinely arrives',
    );
});

t.test('an incident grows across batches, and the digest reports the richer one (R15)', async t => {
    const app = createApp();
    t.teardown(() => app.close());
    // Two requests, because each service emits its own batch: this is the
    // cross-batch case batch-only correlation could never have caught.
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: events(
            [
                {id: 'u1', time: 10, fingerprint: 'fp-u1', service: 'payer'},
                {id: 'u2', time: 20, fingerprint: 'fp-u2', service: 'hub', parent: 'u1'},
            ],
            'tr-2',
        ),
    });
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: events(
            [{id: 'u3', time: 30, fingerprint: 'fp-u3', service: 'payee', parent: 'u2'}],
            'tr-2',
        ),
    });

    const incidents = (await app.inject({method: 'GET', url: '/incidents'})).json() as Array<{
        id: string;
        services: string[];
        rootCause: string;
    }>;
    t.equal(incidents.length, 1, 'one incident, not one per batch');
    t.same(
        [...incidents[0].services].sort(),
        ['hub', 'payee', 'payer'],
        'the later batch joined the earlier one',
    );
    t.equal(incidents[0].rootCause, 'u1');

    const digest = (await app.inject({method: 'GET', url: '/digest?since=0'})).json() as {
        entries: Array<{kind: string; data: {services?: string[]}}>;
    };
    const deltas = digest.entries.filter(entry => entry.kind === 'incident');
    t.equal(deltas.length, 2, 'the first snapshot and the grown incident are two changes');
    t.equal(
        (deltas[1].data.services ?? []).length,
        3,
        'the later delta carries all three services, not the first snapshot',
    );
});

t.test('a single anomaly on its own is not published as an incident', async t => {
    const app = createApp();
    t.teardown(() => app.close());
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: events([{id: 'solo', time: 10, fingerprint: 'fp-solo', service: 'payer'}], 'tr-5'),
    });
    t.same(
        (await app.inject({method: 'GET', url: '/incidents'})).json(),
        [],
        'nothing to correlate',
    );
    const digest = (await app.inject({method: 'GET', url: '/digest?since=0'})).json() as {
        entries: Array<{kind: string}>;
    };
    t.notOk(
        digest.entries.some(entry => entry.kind === 'incident'),
        'the anomaly delta is the report; an incident would be the alert storm R15 prevents',
    );
});

t.test('a rejected batch correlates nothing and leaves nothing pending', async t => {
    // A batch whose *guard* fails is rejected before any commit, so it can never
    // reach the discard. This one commits its first event — raising an anomaly —
    // and then fails on the second, which is the path the test exists for.
    class FaultyLineage extends LineageIndex {
        add(record: IngestEvent): LineageNode {
            if (record.id === 'fail-2') {
                throw new Error('lineage unavailable');
            }
            return super.add(record);
        }
    }
    const app = createApp({lineage: new FaultyLineage()});
    t.teardown(() => app.close());
    const rejected = await app.inject({
        method: 'POST',
        url: '/events',
        payload: events(
            [
                {id: 'fail-1', time: 10, fingerprint: 'fp-fail', service: 'payer'},
                {
                    id: 'fail-2',
                    time: 20,
                    fingerprint: 'fp-fail-2',
                    service: 'hub',
                    parent: 'fail-1',
                },
            ],
            'tr-fail',
        ),
    });
    t.equal(rejected.statusCode, 400, 'a batch that fails after committing an event is rejected');
    t.same(
        (await app.inject({method: 'GET', url: '/incidents'})).json(),
        [],
        'a rejected batch opens no incident',
    );

    // The half-batch's anomaly was discarded, not left pending: the next
    // request's lone anomaly must not join it to fabricate an incident.
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: events(
            [{id: 'later', time: 30, fingerprint: 'fp-later', service: 'payee'}],
            'tr-fail',
        ),
    });
    t.same(
        (await app.inject({method: 'GET', url: '/incidents'})).json(),
        [],
        'the discarded anomaly did not pair with the next request',
    );
});

t.test('a correlation failure on a valid batch is a 500, not a 400 (FIX D)', async t => {
    // Correlation runs *outside* the ingest `try` on purpose: only an unusable
    // payload is a 400, and by the time it runs the batch has been accepted and
    // the registry written. A defect in the service must not be reported to the
    // emitter as a malformed batch, so it surfaces as a 500. The contrast is the
    // `FaultyLineage` test above, whose throw is inside the `ingest` call and is
    // therefore a 400.
    const exploding = new IncidentStore();
    (exploding as unknown as {absorb: () => never}).absorb = () => {
        throw new Error('injected correlation failure');
    };
    const app = createApp({embedding: {kind: 'offline', dimension: 16}, incidents: exploding});
    t.teardown(() => app.close());

    const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: events([{id: 'ok-1', time: 10, fingerprint: 'fp-ok', service: 'hub'}], 'tr-ok'),
    });
    t.equal(response.statusCode, 500, 'the valid batch is not blamed for the service failure');
    t.equal(
        ((await app.inject({method: 'GET', url: '/templates'})).json() as unknown[]).length,
        1,
        'the batch was in fact accepted before correlation ran',
    );
});

t.test("a failed batch discards only its own anomalies, never a concurrent request's", async t => {
    // Request B pauses mid-batch — after committing its first event (which raised
    // an anomaly) and while preparing its second — so its anomaly is owned but not
    // yet correlated. Request A then fails. Under a shared anomaly buffer with a
    // failure-time `length = 0`, A's failure would wipe B's anomaly and B would
    // correlate nothing; with per-request collection it cannot.
    let releaseGate: () => void = () => {};
    const gate = new Promise<void>(resolve => {
        releaseGate = resolve;
    });
    let reachedGate: () => void = () => {};
    const atGate = new Promise<void>(resolve => {
        reachedGate = resolve;
    });
    class GatedCache extends EmbeddingCache {
        async vectorFor(fingerprint: string, signature: string): Promise<number[]> {
            if (fingerprint === 'fp-gate') {
                reachedGate();
                await gate;
            }
            return super.vectorFor(fingerprint, signature);
        }
    }
    class FaultyLineage extends LineageIndex {
        add(record: IngestEvent): LineageNode {
            if (record.id === 'a2') {
                throw new Error('lineage unavailable');
            }
            return super.add(record);
        }
    }
    const app = createApp({
        cache: new GatedCache(createProvider({kind: 'offline', dimension: 8})),
        lineage: new FaultyLineage(),
    });
    t.teardown(() => app.close());

    const slow = app.inject({
        method: 'POST',
        url: '/events',
        payload: events(
            [
                {id: 'b1', time: 10, fingerprint: 'fp-b1', service: 'payer'},
                {id: 'b2', time: 20, fingerprint: 'fp-gate', service: 'hub', parent: 'b1'},
            ],
            'tr-b',
        ),
    });
    await atGate; // B has committed b1, raising an anomaly, and is preparing b2

    const failing = await app.inject({
        method: 'POST',
        url: '/events',
        payload: events(
            [
                {id: 'a1', time: 10, fingerprint: 'fp-a1', service: 'payer'},
                {id: 'a2', time: 20, fingerprint: 'fp-a2', service: 'hub', parent: 'a1'},
            ],
            'tr-a',
        ),
    });
    t.equal(failing.statusCode, 400, 'the faulty batch is rejected while B is in flight');

    releaseGate();
    t.equal((await slow).statusCode, 202, 'the concurrent batch still ingests');

    const incidents = (await app.inject({method: 'GET', url: '/incidents'})).json() as Array<{
        trace: string;
        services: string[];
    }>;
    t.equal(incidents.length, 1, 'the concurrent batch correlated both of its anomalies');
    t.equal(incidents[0].trace, 'tr-b');
    t.same([...incidents[0].services].sort(), ['hub', 'payer']);
});

t.test(
    'the correlation window and the incident buffer are injectable, and both bound the join',
    async t => {
        /** The two arrivals, five milliseconds apart on one trace, under `options`. */
        const incidentsAfter = async (options: ServiceOptions): Promise<Array<{trace: string}>> => {
            const app = createApp(options);
            t.teardown(() => app.close());
            await app.inject({
                method: 'POST',
                url: '/events',
                payload: events(
                    [{id: 'w1', time: 10, fingerprint: 'fp-w1', service: 'payer'}],
                    'tr-3',
                ),
            });
            await app.inject({
                method: 'POST',
                url: '/events',
                payload: events(
                    [{id: 'w2', time: 15, fingerprint: 'fp-w2', service: 'payee'}],
                    'tr-3',
                ),
            });
            return (await app.inject({method: 'GET', url: '/incidents'})).json() as Array<{
                trace: string;
            }>;
        };

        t.equal(
            (await incidentsAfter({})).length,
            1,
            'the defaults hold both anomalies and join them',
        );
        t.same(
            await incidentsAfter({incidents: new IncidentStore(1)}),
            [],
            'an injected one-anomaly buffer cannot join the two',
        );
        t.same(
            await incidentsAfter({lineage: new LineageIndex(4, 4), incidentWindowMs: 1}),
            [],
            'an injected window narrower than the gap splits them into two lone anomalies',
        );
    },
);

// --- persistence wiring (PRD R4) --------------------------------------------

t.test('persistTo saves the registry and the next start restores it (R4)', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-app-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const path = join(dir, 'registry.json');

    // The first service starts with no snapshot at all: the file is created by
    // the ingest save, and nothing else writes it.
    const first = createApp({embedding: {kind: 'offline', dimension: 16}, persistTo: path});
    await first.inject({
        method: 'POST',
        url: '/events',
        payload: events([{id: 'p1', time: 10, fingerprint: 'fp-p1', service: 'payer'}], 'tr-p'),
    });
    const before = ((await first.inject({method: 'GET', url: '/templates'})).json() as unknown[])
        .length;
    await first.close();
    t.ok(before > 0, 'the first run had a template to save');

    // The second starts against the file the first wrote. `ready()` alone is
    // enough: the restore is awaited by the lifecycle, not raced against it.
    const second = createApp({embedding: {kind: 'offline', dimension: 16}, persistTo: path});
    t.teardown(() => second.close());
    await second.ready();
    const after = ((await second.inject({method: 'GET', url: '/templates'})).json() as unknown[])
        .length;
    t.equal(after, before, 'the registry is not recomputed from records');
});

t.test('a corrupt snapshot is quarantined, and the service starts empty (R4 ruling)', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-app-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const path = join(dir, 'registry.json');
    await writeFile(path, '{not json');
    const app = createApp({persistTo: path});
    t.teardown(() => app.close());
    const warnings: unknown[][] = [];
    (app.log as unknown as {warn: (...args: unknown[]) => void}).warn = (...args: unknown[]) => {
        warnings.push(args);
    };

    // Refusing to serve over one truncated cache file is the failure this ruling
    // forbids: the service boots, reports, and starts fresh. Deleting the file
    // would lose the evidence, so it is moved aside instead.
    t.equal(
        (await app.inject({method: 'GET', url: '/health'})).statusCode,
        200,
        'the service serves despite the snapshot',
    );
    t.same(
        (await app.inject({method: 'GET', url: '/templates'})).json(),
        [],
        'and starts with an empty registry',
    );
    t.same(
        await readdir(dir),
        ['registry.json.corrupt'],
        'the unreadable file is moved aside, not deleted',
    );
    t.match(
        await readFile(join(dir, 'registry.json.corrupt'), 'utf8'),
        /^\{not json$/,
        'and the evidence is preserved',
    );

    t.equal(warnings.length, 1, 'the quarantine is reported once, loudly');
    t.equal(
        String(warnings[0][1]),
        'semantic-log: the snapshot could not be used; moving it aside and starting empty',
    );
});

t.test(
    'a snapshot that cannot be read at all is quarantined, and the service boots (R4 ruling)',
    async t => {
        // A directory where the snapshot should be is the read failure that is *not* "there is
        // no such file": it is reported rather than read as an empty registry, because an empty
        // answer would be saved back over it on the next write. It still must not stop the
        // service — that rule holds for every reason a snapshot is unusable, not only for JSON
        // that does not parse.
        const dir = await mkdtemp(join(tmpdir(), 'semantic-log-app-'));
        t.teardown(() => rm(dir, {recursive: true, force: true}));
        const path = join(dir, 'registry.json');
        await mkdir(path);
        const app = createApp({persistTo: path});
        t.teardown(() => app.close());
        const warnings: unknown[][] = [];
        (app.log as unknown as {warn: (...args: unknown[]) => void}).warn = (
            ...args: unknown[]
        ) => {
            warnings.push(args);
        };

        t.equal(
            (await app.inject({method: 'GET', url: '/health'})).statusCode,
            200,
            'the service still boots',
        );
        t.same(
            await readdir(dir),
            ['registry.json.corrupt'],
            'and the unreadable path is moved aside',
        );
        t.equal(warnings.length, 1, 'reported once, with the reason it reports');
    },
);

t.test(
    'a snapshot from another version or provider is quarantined under its own name (D19, D26)',
    async t => {
        // Three reasons a snapshot is not restored, and they are not the same evidence: a
        // file this version cannot read, a file an older version wrote, and a file another
        // embedding provider wrote. Calling the last two `corrupt` would be a lie the
        // operator then has to disprove, so the suffix says which one it was.
        const dir = await mkdtemp(join(tmpdir(), 'semantic-log-app-'));
        t.teardown(() => rm(dir, {recursive: true, force: true}));
        for (const [name, body] of [
            ['v1', JSON.stringify({version: 1, entries: []})],
            [
                'provider',
                JSON.stringify({
                    version: 2,
                    provider: {kind: 'local', model: 'Xenova/all-MiniLM-L6-v2', dimension: 384},
                    entries: [],
                    kinds: [],
                }),
            ],
        ] as const) {
            // A directory each, so one case's quarantine is not read as the next one's.
            const scratch = join(dir, name);
            await mkdir(scratch, {recursive: true});
            const path = join(scratch, 'registry.json');
            await writeFile(path, body);
            const app = createApp({embedding: {kind: 'offline', dimension: 16}, persistTo: path});
            const warnings: unknown[][] = [];
            (app.log as unknown as {warn: (...args: unknown[]) => void}).warn = (
                ...args: unknown[]
            ) => {
                warnings.push(args);
            };
            t.equal(
                (await app.inject({method: 'GET', url: '/health'})).statusCode,
                200,
                `${name}: the service boots`,
            );
            // An older version is `unsupported`, another provider is `provider`: one suffix
            // per reason, so the operator reads the reason rather than a guess.
            const reason = name === 'v1' ? 'unsupported' : 'provider';
            t.same(
                await readdir(scratch),
                [`registry.json.${reason}`],
                `${name}: kept aside under its reason`,
            );
            t.equal(warnings.length, 1, `${name}: reported once`);
            await app.close();
        }
    },
);

t.test('the observed calls are saved with the batch that produced them (D17)', async t => {
    // The unions share the snapshot the registry is written to, and R4 requires the
    // registry to be durable before a batch is acknowledged — so the observation reaches
    // disk on the same guarantee, in the same file, on the same request. D18 ruled that
    // this write be debounced; it is not, because there is no window between the two
    // halves of one file to gain (see `.github/memory/decision.md`).
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-app-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const path = join(dir, 'registry.json');
    const app = createApp({embedding: {kind: 'offline', dimension: 16}, persistTo: path});
    t.teardown(() => app.close());
    const posted = await app.inject({
        method: 'POST',
        url: '/events',
        payload: batch('01ARZ3NDEKTSV4RRFFQ69G5FAV'),
    });
    t.equal(posted.statusCode, 202, 'the batch is acknowledged');
    const saved = JSON.parse(await readFile(path, 'utf8')) as {version: number; kinds: unknown[]};
    t.equal(saved.version, 2, 'and the snapshot on disk is the current shape');
    t.equal(saved.kinds.length, 1, 'including the calls that batch was observed to make');
});

t.test(
    'the observed calls survive a restart, and the diagram is what was observed (D17)',
    async t => {
        const dir = await mkdtemp(join(tmpdir(), 'semantic-log-app-'));
        t.teardown(() => rm(dir, {recursive: true, force: true}));
        const path = join(dir, 'registry.json');
        const flowId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
        const first = createApp({embedding: {kind: 'offline', dimension: 16}, persistTo: path});
        await first.inject({method: 'POST', url: '/events', payload: batch(flowId)});
        await first.close();

        // A fresh process, the same file: the diagram a restarted service draws is the one
        // the first service observed. The registry is the other half of that claim, and the
        // per-execution ring is deliberately *not* restored — one execution's steps are of
        // interest only while it is recent.
        const second = createApp({embedding: {kind: 'offline', dimension: 16}, persistTo: path});
        t.teardown(() => second.close());
        const diagram = (
            await second.inject({method: 'GET', url: '/flows/transfer.single/diagram'})
        ).json();
        t.equal(diagram.kind, 'transfer.single', 'the kind came back');
        t.same(
            diagram.observed.legs.map((leg: {leg: string}) => leg.leg),
            ['payer.quote.rates'],
            'with its calls',
        );
        t.match(
            diagram.diagram,
            /payer->>hub: payer\.quote\.rates/,
            'and the arrows they add up to',
        );
        const execution = await second.inject({method: 'GET', url: `/flows/${flowId}/diagram`});
        t.equal(
            execution.statusCode,
            404,
            'while the execution detail is process-lifetime, by design',
        );
    },
);

t.test(
    'a snapshot that cannot be quarantined still does not stop the service (R4 ruling)',
    async t => {
        const dir = await mkdtemp(join(tmpdir(), 'semantic-log-app-'));
        t.teardown(() => rm(dir, {recursive: true, force: true}));
        const path = join(dir, 'registry.json');
        await writeFile(path, '{not json');
        // The quarantine target is a directory, so the rename cannot succeed for any
        // user — this pins the "booting still wins" branch without a permission
        // trick that root (and some CI runners) would bypass.
        await mkdir(`${path}.corrupt`);
        const app = createApp({persistTo: path});
        t.teardown(() => app.close());
        const errors: unknown[][] = [];
        (app.log as unknown as {error: (...args: unknown[]) => void}).error = (
            ...args: unknown[]
        ) => {
            errors.push(args);
        };

        t.equal(
            (await app.inject({method: 'GET', url: '/health'})).statusCode,
            200,
            'the service still boots',
        );
        t.same(
            (await app.inject({method: 'GET', url: '/templates'})).json(),
            [],
            'still empty, not failed',
        );
        t.ok(
            (await stat(path)).isFile(),
            'the unreadable file is still there: it could not be moved',
        );
        t.equal(errors.length, 1, 'the failed quarantine is escalated to an error, not swallowed');
    },
);

// --- the retired-template writer (PRD R8) -----------------------------------

t.test('retiring a template publishes the delta a poller waits for (R8)', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: events(
            [{id: 'r1', time: 10, fingerprint: 'fp-retire-me', service: 'hub'}],
            'tr-r',
        ),
    });
    const ref = 'fp-retire-me';

    const unknown = await app.inject({method: 'POST', url: '/templates/nope/retire'});
    t.equal(unknown.statusCode, 404, 'retiring something that is not there is not a retirement');

    const response = await app.inject({method: 'POST', url: `/templates/${ref}/retire`});
    t.equal(response.statusCode, 200);
    const retired = response.json() as {ref: string; retiredAt?: number};
    t.equal(retired.ref, ref);
    t.ok(retired.retiredAt !== undefined, 'the entry is stamped, not deleted');

    const digest = (await app.inject({method: 'GET', url: '/digest?since=0'})).json() as {
        entries: Array<{kind: string; data: {ref?: string; retiredAt?: number}}>;
    };
    const delta = digest.entries.find(entry => entry.kind === 'template-retired');
    t.ok(delta, 'the delta arrives — this is the producer the kind was missing');
    t.equal(delta?.data.ref, ref);
    t.ok(delta?.data.retiredAt !== undefined, 'and it carries the moment the template went away');

    const again = await app.inject({method: 'POST', url: `/templates/${ref}/retire`});
    t.equal(again.statusCode, 200, 're-retiring is idempotent, not an error');
    const after = (await app.inject({method: 'GET', url: '/digest?since=0'})).json() as {
        entries: Array<{kind: string}>;
    };
    t.equal(
        after.entries.filter(entry => entry.kind === 'template-retired').length,
        1,
        'and it is not a second delta: a delta is a change, and nothing changed',
    );

    const entry = (
        await app.inject({method: 'GET', url: `/templates/${ref}?facet=ops`})
    ).json() as {retiredAt?: number};
    t.ok(entry.retiredAt !== undefined, 'the entry stays readable and reports its retirement');
});

t.test('a retired template is what the deploy diff calls removed (R14)', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    // A last sighting far in the future, so `lastSeen` alone cannot explain the
    // `removed` bucket: only the retirement stamp can.
    const lastSeen = 2_000_000_000_000;
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: events(
            [{id: 'd1', time: lastSeen, fingerprint: 'fp-diff', service: 'hub'}],
            'tr-d',
        ),
    });
    await app.inject({method: 'POST', url: '/templates/fp-diff/retire'});

    const diff = (
        await app.inject({method: 'GET', url: '/diff?from=1000000000000&to=' + Date.now()})
    ).json() as {
        added: Array<{ref: string}>;
        removed: Array<{ref: string}>;
    };
    t.same(diff.added, [], 'the template was first seen before the window');
    t.same(
        diff.removed.map(entry => entry.ref),
        ['fp-diff'],
        'the retirement stamp is what removed it (R14)',
    );
});

t.test('a retirement is saved, not just published (R4/R8)', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-app-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const path = join(dir, 'registry.json');

    const first = createApp({embedding: {kind: 'offline', dimension: 16}, persistTo: path});
    await first.inject({
        method: 'POST',
        url: '/events',
        payload: events([{id: 'k1', time: 10, fingerprint: 'fp-keep', service: 'hub'}], 'tr-k'),
    });
    await first.inject({method: 'POST', url: '/templates/fp-keep/retire'});
    await first.close();

    const second = createApp({embedding: {kind: 'offline', dimension: 16}, persistTo: path});
    t.teardown(() => second.close());
    await second.ready();
    const entry = (
        await second.inject({method: 'GET', url: '/templates/fp-keep?facet=ops'})
    ).json() as {
        retiredAt?: number;
    };
    t.ok(entry.retiredAt !== undefined, 'the retirement is in the snapshot, not only in memory');
});

// --- flow observation wiring (R22/R23) -------------------------------------

t.test('both diagram routes report the branches they observed (R26/R27)', async t => {
    const ledger = new FlowLedger();
    const app = createApp({embedding: {kind: 'offline', dimension: 16}, flowLedger: ledger});
    t.teardown(() => app.close());
    const flowId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
            events: [
                {
                    id: 'leg-1',
                    time: 10,
                    fingerprint: 'fp-leg-1',
                    service: 'fxp',
                    flow: {
                        id: flowId,
                        kind: 'transfer.single',
                        step: 'quote',
                        leg: 'fxp.quote.rates',
                        legFrom: 'fxp',
                        legTo: 'hub',
                        legSeq: '1',
                    },
                    progress: {
                        regions: [
                            {
                                id: '1',
                                discriminator: 'rate-within-limit',
                                candidates: ['decline', 'accept'],
                                chosen: 'decline',
                            },
                        ],
                        points: ['rate-declined'],
                    },
                },
            ],
        },
    });

    const execution = await app.inject({method: 'GET', url: `/flows/${flowId}/diagram`});
    const body = execution.json() as {
        observed: {branches: string[]; points: string[]};
        diagram: string;
    };
    t.same(
        body.observed.branches,
        ['rate-within-limit'],
        'the branch the run was observed inside, named for a reader',
    );
    t.same(body.observed.points, ['rate-declined'], 'and the milestones it reported');
    t.match(body.diagram, /alt rate-within-limit/);
    t.match(body.diagram, /Note over fxp: point: rate-declined/);

    const kind = await app.inject({method: 'GET', url: '/flows/transfer.single/diagram'});
    t.same(
        (kind.json() as {observed: {branches: string[]}}).observed.branches,
        ['rate-within-limit'],
        'the kind route answers the same question over every execution it saw',
    );
    t.end();
});

t.test('an accepted event reaches the flow ledger, which is what the diagrams read', async t => {
    // The ledger is fed from the ingest's accepted-event seam rather than from a
    // route, so one accepted event produces one observation whether it arrived in
    // a batch or alone — and so both ends of a call are seen by the same reader, in
    // one order, which is what lets the declaration be credited with the receipt.
    const ledger = new FlowLedger();
    const app = createApp({embedding: {kind: 'offline', dimension: 16}, flowLedger: ledger});
    t.teardown(() => app.close());
    const flowId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
            events: [
                {
                    id: 'leg-1',
                    time: 10,
                    fingerprint: 'fp-leg-1',
                    service: 'payer',
                    flow: {
                        id: flowId,
                        kind: 'transfer.single',
                        step: 'quote',
                        leg: 'payer.quote.rates',
                        legFrom: 'payer',
                        legTo: 'hub',
                        legSeq: '1',
                    },
                },
                {
                    id: 'leg-2',
                    time: 12,
                    fingerprint: 'fp-leg-2',
                    service: 'hub',
                    flow: {
                        id: flowId,
                        kind: 'transfer.single',
                        step: 'quote',
                        leg: 'payer.quote.rates',
                        legSeq: '1',
                    },
                },
            ],
        },
    });

    t.equal(response.statusCode, 202);
    t.equal(ledger.size(), 1, 'the execution is retained under the id its emitter minted');
    const union = ledger.unionOf('transfer.single');
    t.same(
        union?.legs.map(leg => leg.leg),
        ['payer.quote.rates'],
        'and the call it traversed is observed',
    );
    t.same(
        union?.legs[0]?.ends,
        [{caller: 'payer', callee: 'hub', count: 1, observed: 1}],
        'the caller declared both ends, and the receiver was seen too — so the call is an answered edge',
    );
    t.equal(
        ledger.executionOf(flowId)?.observations.length,
        2,
        'the instance view has both records in order',
    );
});

/** A batch of one execution: the two ends of one answered call, then a record with no call. */
function batch(flowId: string, kind = 'transfer.single') {
    return {
        events: [
            {
                id: 'leg-1',
                time: 10,
                fingerprint: 'fp-leg-1',
                service: 'payer',
                flow: {
                    id: flowId,
                    kind,
                    step: 'quote',
                    leg: 'payer.quote.rates',
                    legFrom: 'payer',
                    legTo: 'hub',
                    legSeq: '1',
                },
            },
            {
                id: 'leg-2',
                time: 12,
                fingerprint: 'fp-leg-2',
                service: 'hub',
                flow: {id: flowId, kind, step: 'quote', leg: 'payer.quote.rates', legSeq: '1'},
            },
            {
                id: 'leg-3',
                time: 13,
                fingerprint: 'fp-leg-3',
                service: 'hub',
                flow: {id: flowId, kind, status: 'completed'},
            },
        ],
    };
}

t.test('the flows route lists what was observed, per kind and per execution (R23)', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: batch('01ARZ3NDEKTSV4RRFFQ69G5FAV'),
    });

    const response = await app.inject({method: 'GET', url: '/flows'});
    t.equal(response.statusCode, 200);
    const body = response.json();
    t.equal(body.unions.length, 1, 'the kind that was observed');
    t.equal(body.unions[0].kind, 'transfer.single');
    t.equal(body.executions.length, 1, 'and the execution');
    t.equal(body.executions[0].closed, true, 'which the emitter reported finished');
    t.same(
        body.executions[0].services,
        ['payer', 'hub'],
        'with the participants, records and calls alike',
    );
    t.notOk('observations' in body.executions[0], 'and without a thousand executions of records');
    t.equal(body.evictions, 0);
    t.equal(body.truncations, 0);
    t.end();
});

t.test('the kind diagram is the union of the calls observed under it (R23)', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: batch('01ARZ3NDEKTSV4RRFFQ69G5FAV'),
    });

    const response = await app.inject({method: 'GET', url: '/flows/transfer.single/diagram'});
    t.equal(response.statusCode, 200);
    const body = response.json();
    t.equal(body.kind, 'transfer.single');
    t.equal(body.observed.executions, 1);
    t.same(body.observed.services, ['payer', 'hub']);
    t.same(
        body.observed.legs.map((leg: {leg: string}) => leg.leg),
        ['payer.quote.rates'],
        'the union, with the counts a kind-level diagram is drawn from',
    );
    t.equal(
        body.diagram,
        'sequenceDiagram\n' +
            '    autonumber\n' +
            '    participant payer\n' +
            '    participant hub\n' +
            '    Note over payer, hub: PHASE 1: quote\n' +
            '    payer->>hub: payer.quote.rates\n' +
            '    hub-->>payer: payer.quote.rates\n',
        'and a diagram a browser can parse',
    );
    t.end();
});

t.test('an unknown kind is a 404 that names the kinds there are', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: batch('01ARZ3NDEKTSV4RRFFQ69G5FAV'),
    });

    const response = await app.inject({method: 'GET', url: '/flows/transfer.inter/diagram'});
    t.equal(response.statusCode, 404);
    t.equal(response.json().error, 'unknown flow kind');
    t.same(
        response.json().kinds,
        ['transfer.single'],
        'a caller is told what there is instead of nothing',
    );
    t.end();
});

t.test('an execution diagram is that run, and an unretained id is its own 404', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    const flowId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    await app.inject({method: 'POST', url: '/events', payload: batch(flowId)});

    const response = await app.inject({method: 'GET', url: `/flows/${flowId}/diagram`});
    t.equal(response.statusCode, 200);
    t.equal(response.json().id, flowId);
    t.equal(response.json().kind, 'transfer.single');
    t.equal(response.json().closed, true);
    t.same(response.json().observed.legs, ['payer.quote.rates'], 'the calls, in position order');
    t.equal(response.json().observed.refs.length, 3, 'and the shape drift compares');

    // Never observed, and evicted are two different answers: telling a caller the
    // wrong one sends it looking in the wrong place.
    const missing = await app.inject({
        method: 'GET',
        url: '/flows/01ARZ3NDEKTSV4RRFFQ69G5FAZ/diagram',
    });
    t.equal(missing.statusCode, 404);
    t.equal(missing.json().error, 'flow execution not retained');
    t.equal(missing.json().retained, 1, 'what is held, and what has been dropped');
    t.equal(missing.json().evictions, 0);
    t.end();
});

t.test('an execution with no calls still diagrams, saying there is nothing to draw', async t => {
    // "Not retained" and "observed, but it made no call" are different answers, and a
    // 404 for the second would be wrong: the execution is there, its shape is empty.
    const app = createApp({embedding: {kind: 'offline', dimension: 16}});
    t.teardown(() => app.close());
    const flowId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
            events: [
                {
                    id: 'a',
                    time: 1,
                    fingerprint: 'fp-a',
                    service: 'payer',
                    flow: {id: flowId, kind: 'transfer.single'},
                },
            ],
        },
    });

    const response = await app.inject({method: 'GET', url: `/flows/${flowId}/diagram`});
    t.equal(response.statusCode, 200);
    t.same(response.json().observed.legs, []);
    // A participant is the unit a call names, so an execution whose records carry no call
    // names none: the diagram is the empty one rather than a participant invented from the
    // process that wrote the records. Which process wrote them is still on `observed`.
    t.equal(response.json().diagram, 'sequenceDiagram\n    autonumber\n');
    t.end();
});
