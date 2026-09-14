/**
 * Plan 2 acceptance: the requirements this plan owns, asserted end to end
 * through the service's routes rather than through its internals.
 *
 * Every test here drives `createApp()` with `app.inject()` — no port, no
 * network — and asserts observable service behaviour. Internals already pinned
 * by the unit suites (`persistence.test.ts`, `ingest.test.ts`, `app.test.ts`,
 * `registry.test.ts`, `lineage.test.ts`) are deliberately not re-asserted: a
 * duplicate assertion is not an acceptance test.
 *
 * Covered here, because an independent review found the routes had no
 * acceptance coverage for them at all: R3 (cost scales with distinct
 * templates, not volume), R4 (the registry is the durable artifact), R5 (the
 * embedding provider is pluggable), R6 (the three detectors fire through the
 * ingest, and stay distinguishable), R8 (the digest delta stream, without
 * duplicate alerts), R12 (identity is the emitter's fingerprint and is stable
 * across deploys) and R13 (the exemplar bound); plus light R14/R16 route reads
 * on the same rehearsal.
 */

import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import t from 'tap';
import {createApp} from '../../src/service/app.ts';
import {EmbeddingCache} from '../../src/service/embedding.ts';
import {createProvider} from '../../src/service/provider.ts';

/** The slice of a published anomaly this suite reads back from the digest. */
interface AnomalyAlert {
    kind?: string;
    anomalyRef?: string;
    templateRef?: string;
    detail?: string;
    magnitude?: number;
    time?: number;
}

interface DigestEntry {
    seq: number;
    kind: string;
    data: AnomalyAlert;
}

interface DigestView {
    cursor: number;
    stats: {dropped: number; retained: number; oldest: number};
    entries: DigestEntry[];
}

/** The two flow execution ULIDs the drift rehearsal runs under. */
const FLOW_A = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const FLOW_B = '01ARZ3NDEKTSV4RRFFQ69G5FAW';

/**
 * A batch shaped like the two transfer flows: discovery, quote, transfer. The
 * fingerprint is derived from the service and the step parity, so the two flows
 * genuinely share some templates (`payer`, `fxp`, `payee`) and differ in
 * others — which is what the no-duplicate-alerts assertion needs.
 */
function flowBatch(participants: string[], trace: string, time: number): object {
    return {
        events: participants.map((service, index) => ({
            id: `${trace}-${service}-${index}`,
            time: time + index,
            fingerprint: `fp-${service}-${index % 2}`,
            template: `[LEVEL: INFO] [SERVICE: ${service}] [OP: transfer.step${index % 2}] [MSG: step]`,
            service,
            level: 30,
            levelName: 'info',
            msg: 'step',
            refs: {
                record: `${trace}-${service}-${index}`,
                trace,
                ...(index ? {parent: `${trace}-${participants[index - 1]}-${index - 1}`} : {}),
            },
            intent: {name: 'User_Transfer'},
        })),
    };
}

async function readDigest(app: {inject: (options: object) => Promise<{json: () => unknown}>}): Promise<DigestView> {
    const response = await app.inject({method: 'GET', url: '/digest?since=0'});
    return response.json() as DigestView;
}

t.test('a two-flow rehearsal yields templates, a digest, and no duplicate alerts (R8)', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 32}});
    t.teardown(() => app.close());

    await app.inject({
        method: 'POST',
        url: '/events',
        payload: flowBatch(['payer', 'hub', 'fxp', 'payee'], 'tr-1', 1000),
    });
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: flowBatch(['payer', 'hubA', 'proxy', 'hubB', 'fxp', 'payee'], 'tr-2', 2000),
    });

    const templates = (await app.inject({method: 'GET', url: '/templates'})).json() as Array<{
        ref: string;
        count: number;
    }>;
    t.equal(templates.length, 7, 'seven distinct fingerprints across the two flows');

    const digest = await readDigest(app);
    const added = digest.entries.filter(entry => entry.kind === 'template-added');
    t.equal(added.length, templates.length, 'one template-added delta per new template, not per event');

    const alerts = digest.entries.filter(entry => entry.kind === 'anomaly');
    t.equal(alerts.length, templates.length, 'one alert per distinct template: the shared occurrences raise none');
    const alertedRefs = alerts.map(entry => entry.data.anomalyRef);
    t.equal(new Set(alertedRefs).size, alertedRefs.length, 'no duplicate alerts: no template is alerted twice');
    t.ok(
        alerts.every(entry => entry.data.kind === 'novelty'),
        'every alert is the novelty of a template seen for the first time',
    );
    t.equal(digest.stats.dropped, 0, 'the rehearsal fits inside the digest bound, so nothing was silently evicted');

    // The R14/R16 route reads, on the same rehearsal: the deploy diff sees the
    // new templates, and a facet is served for a real template.
    const diff = (await app.inject({method: 'GET', url: '/diff?from=0&to=5000'})).json() as {
        added: Array<{ref: string}>;
    };
    t.equal(diff.added.length, templates.length, 'every template was first seen inside the window');
    const facet = (
        await app.inject({method: 'GET', url: `/templates/${templates[0].ref}?facet=compliance`})
    ).json() as {intents: string[]};
    t.same(facet.intents, ['User_Transfer'], 'the compliance facet projects the intent the events carried');
});

t.test('the provider is consulted once per distinct template across both flows (R3/SC3)', async t => {
    const provider = createProvider({kind: 'offline', dimension: 32});
    const cache = new EmbeddingCache(provider);
    const app = createApp({embedding: {kind: 'offline', dimension: 32}, cache});
    t.teardown(() => app.close());

    await app.inject({
        method: 'POST',
        url: '/events',
        payload: flowBatch(['payer', 'hub', 'fxp', 'payee'], 'tr-1', 1000),
    });
    const afterFirstFlow = cache.calls();
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: flowBatch(['payer', 'hubA', 'proxy', 'hubB', 'fxp', 'payee'], 'tr-2', 2000),
    });

    const templates = (await app.inject({method: 'GET', url: '/templates'})).json() as unknown[];
    t.equal(afterFirstFlow, 4, 'the first flow embedded its four fingerprints');
    t.equal(
        cache.calls(),
        templates.length,
        `one embedding per distinct template (${templates.length}), not per event (10 events were sent)`,
    );
    t.equal(cache.size(), templates.length, 'the cache holds exactly one vector per distinct template');
});

t.test('the registry survives a restart (R4)', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-acceptance-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const path = join(dir, 'registry.json');

    const first = createApp({embedding: {kind: 'offline', dimension: 32}, persistTo: path});
    await first.inject({
        method: 'POST',
        url: '/events',
        payload: flowBatch(['payer', 'hub', 'fxp', 'payee'], 'tr-1', 1000),
    });
    const before = (await first.inject({method: 'GET', url: '/templates'})).json() as Array<{
        ref: string;
        count: number;
    }>;
    t.ok(before.length > 0, 'the first run had templates to save');
    await first.close();

    const second = createApp({embedding: {kind: 'offline', dimension: 32}, persistTo: path});
    t.teardown(() => second.close());
    await second.ready();
    const after = (await second.inject({method: 'GET', url: '/templates'})).json() as Array<{
        ref: string;
        count: number;
    }>;
    t.equal(after.length, before.length, 'the template set is restored, not recomputed from records');
    t.same(
        after.map(entry => [entry.ref, entry.count]).sort(),
        before.map(entry => [entry.ref, entry.count]).sort(),
        'each template is restored with its identity and its count, not merely its number',
    );
});

t.test('identity is stable across deploys: the fingerprint is the identity, not the text (R12)', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 32}});
    t.teardown(() => app.close());

    const deploy = (id: string, fingerprint: string, template: string): object => ({
        events: [{id, time: 1, fingerprint, service: 'hub', template, refs: {record: id, trace: 'tr-deploy'}}],
    });

    // Same fingerprint, reworded message: one template, not two. The service does
    // no identity work — the emitter's fingerprint *is* the identity — so a
    // reworded message is not a new template, however the text changed.
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: deploy('d1', 'stablefingerprint', '[LEVEL: INFO] [SERVICE: hub] [MSG: transfer <NUM> accepted]'),
    });
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: deploy('d2', 'stablefingerprint', '[LEVEL: INFO] [SERVICE: hub] [MSG: transfer <NUM> accepted by hub]'),
    });

    const before = (await app.inject({method: 'GET', url: '/templates'})).json() as Array<{
        ref: string;
        count: number;
    }>;
    t.equal(before.length, 1, 'a reworded message under the same fingerprint is one template');
    t.equal(before[0].count, 2, 'and the second occurrence is a count, not a second template');

    // The contrast: a different fingerprint with the same text is a different
    // template, because identity is the fingerprint and nothing else.
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: deploy('d3', 'otherfingerprint', '[LEVEL: INFO] [SERVICE: hub] [MSG: transfer <NUM> accepted]'),
    });
    const after = (await app.inject({method: 'GET', url: '/templates'})).json() as unknown[];
    t.equal(after.length, 2, 'identity is the fingerprint, not the message text');
});

t.test('a second provider kind works through the same route (R5)', async t => {
    // The offline provider needs no keys and no network, so it cannot show that
    // the provider is *pluggable*. The remote kind, with an injected client,
    // exercises the other path through the same `/events` route without touching
    // the network at all.
    const seen: string[] = [];
    const vector = [0.25, 0.25, 0.25, 0.25];
    const fakeFetch = async (url: string, init: {body: string}): Promise<{ok: boolean; json: () => Promise<unknown>}> => {
        seen.push((JSON.parse(init.body) as {input: string}).input);
        return {ok: true, json: async () => ({data: [{embedding: vector}]})};
    };
    const app = createApp({
        embedding: {
            kind: 'remote',
            url: 'https://embedding.test/v1/embeddings',
            model: 'acceptance-model',
            dimension: 4,
            fetch: fakeFetch as unknown as typeof fetch,
        },
    });
    t.teardown(() => app.close());

    const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
            events: [
                {id: 'r5-1', time: 10, fingerprint: 'fp-remote', service: 'hub', template: '[MSG: a]'},
                {id: 'r5-2', time: 11, fingerprint: 'fp-remote', service: 'hub', template: '[MSG: a]'},
            ],
        },
    });
    t.equal(response.statusCode, 202, 'the remote-backed service ingests through the same route');
    t.equal(seen.length, 1, 'the remote provider is consulted once per distinct template');
    t.equal(seen[0], '[MSG: a]', 'and it receives the structural signature, not the fingerprint');

    const templates = (await app.inject({method: 'GET', url: '/templates'})).json() as Array<{
        ref: string;
        count: number;
    }>;
    t.equal(templates.length, 1);
    t.equal(templates[0].count, 2);

    // The remote vector is the one the service ranks on: a query finds the
    // template, so the pluggable provider is genuinely in the read path too.
    const found = (await app.inject({method: 'GET', url: '/search?q=anything'})).json() as Array<{ref: string}>;
    t.ok(found.some(entry => entry.ref === 'fp-remote'), 'the remote vector is what the search route ranks');
});

t.test('all three detectors fire through the ingest route and stay distinguishable (R6)', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 32}});
    t.teardown(() => app.close());

    // R6a novelty: a fingerprint the registry has never held.
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: {events: [{id: 'nov-1', time: 1000, fingerprint: 'fp-novelty', service: 'payer', template: '[MSG: novel]'}]},
    });

    // R6b rate-shift: five completed windows of one occurrence, then a second
    // occurrence in the sixth. The baseline is the template's own history
    // (per template, never global), so this surge is reachable only through the
    // route — a unit test could feed `RateTracker` directly.
    const rateEvents = [0, 60_000, 120_000, 180_000, 240_000, 300_000, 300_001].map((time, index) => ({
        id: `rate-${index}`,
        time,
        fingerprint: 'fp-rate',
        service: 'hub',
        template: '[MSG: rate]',
    }));
    await app.inject({method: 'POST', url: '/events', payload: {events: rateEvents}});

    // R6c drift: two completed executions of the SAME flow kind with different
    // shapes. A template's own vector can never move — it is keyed by its own
    // fingerprint — so drift is reachable only at the flow granularity, and only
    // through the route's flow handling.
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
            events: [
                {id: 'a1', time: 5000, fingerprint: 'fp-single-1', service: 'hub', template: '[MSG: step1]', flow: {id: FLOW_A, kind: 'transfer.single', index: 0, status: 'running'}},
                {id: 'a2', time: 5001, fingerprint: 'fp-single-2', service: 'hub', template: '[MSG: step2]', flow: {id: FLOW_A, kind: 'transfer.single', index: 1, status: 'completed'}},
            ],
        },
    });
    await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
            events: [
                {id: 'b1', time: 6000, fingerprint: 'fp-single-1', service: 'hub', template: '[MSG: step1]', flow: {id: FLOW_B, kind: 'transfer.single', index: 0, status: 'running'}},
                {id: 'b2', time: 6001, fingerprint: 'fp-single-2', service: 'hub', template: '[MSG: step2]', flow: {id: FLOW_B, kind: 'transfer.single', index: 1, status: 'running'}},
                {id: 'b3', time: 6002, fingerprint: 'fp-single-3', service: 'hub', template: '[MSG: step3]', flow: {id: FLOW_B, kind: 'transfer.single', index: 2, status: 'completed'}},
            ],
        },
    });

    const digest = await readDigest(app);
    const alerts = digest.entries.filter(entry => entry.kind === 'anomaly').map(entry => entry.data);
    const kinds = [...new Set(alerts.map(alert => alert.kind))].sort();
    t.same(kinds, ['drift', 'novelty', 'rate-shift'], 'all three detector kinds fired through the route');

    const novelty = alerts.find(alert => alert.kind === 'novelty');
    t.equal(novelty?.anomalyRef, 'fp-novelty', 'novelty is keyed by the template');
    const rateShift = alerts.find(alert => alert.kind === 'rate-shift');
    t.equal(rateShift?.anomalyRef, 'fp-rate', 'rate-shift is keyed by the template that surged');
    t.match(String(rateShift?.detail), /baseline/, 'and reports the flat-baseline surge');
    const drift = alerts.find(alert => alert.kind === 'drift');
    t.equal(drift?.anomalyRef, 'transfer.single', 'drift is keyed by the flow kind, not by a template ref');
    t.equal(drift?.templateRef, 'fp-single-3', 'and names the template whose event triggered it');

    // The alert stamps land on the right surface: template alerts on the
    // template entry, and the flow drift on the deploy diff's `drifted` bucket.
    const entry = (await app.inject({method: 'GET', url: '/templates/fp-rate'})).json() as {
        alerts: {noveltyAt?: number; rateShiftAt?: number};
    };
    t.equal(entry.alerts.noveltyAt, 0, 'the first rate event was also that template\'s novelty');
    t.equal(entry.alerts.rateShiftAt, 300_001, 'the surge is stamped on the template it belongs to');

    const diff = (await app.inject({method: 'GET', url: '/diff?from=0&to=100000'})).json() as {
        drifted: Array<{kind: string; count: number; lastDistance: number}>;
    };
    const drifted = diff.drifted.find(item => item.kind === 'transfer.single');
    t.ok(drifted, 'the flow kind whose shape moved is what the diff reports as drifted');
    t.equal(drifted?.count, 1, 'one drift recorded for the kind');
    t.ok((drifted?.lastDistance ?? 0) > 0.25, 'the recorded distance is beyond the drift epsilon');
});

t.test('the exemplar bound holds through the route (R13)', async t => {
    const app = createApp({embedding: {kind: 'offline', dimension: 16}, exemplarLimit: 2});
    t.teardown(() => app.close());

    const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
            events: ['x1', 'x2', 'x3'].map((id, index) => ({
                id,
                time: index + 1,
                fingerprint: 'fp-bound',
                service: 'hub',
                template: '[MSG: bound]',
            })),
        },
    });
    t.equal(response.statusCode, 202);
    t.same(
        response.json(),
        {accepted: 3, templates: 1, anomalies: 1, skipped: 0},
        'three occurrences, one template, one novelty alert',
    );

    const entry = (await app.inject({method: 'GET', url: '/templates/fp-bound'})).json() as {
        count: number;
        exemplars: string[];
    };
    t.equal(entry.count, 3, 'every occurrence is counted');
    t.equal(entry.exemplars.length, 2, 'but only the exemplar bound is retained');
    t.same(entry.exemplars, ['x1', 'x2'], 'the first occurrences are the ones kept');

    t.equal((await app.inject({method: 'GET', url: '/records/x1'})).statusCode, 200, 'a retained exemplar is fetchable');
    t.equal(
        (await app.inject({method: 'GET', url: '/records/x3'})).statusCode,
        404,
        'the occurrence past the bound was not retained',
    );

    const digest = await readDigest(app);
    t.equal(
        digest.entries.filter(entry => entry.kind === 'exemplar-retained').length,
        2,
        'the digest advertises exactly the retained exemplars',
    );
});
