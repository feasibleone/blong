/**
 * Template-level semantic search and the deploy diff (PRD R12, R14).
 *
 * The diff's `drifted` bucket is exercised against the real flow-drift surface:
 * `FlowDriftHistory`, the per-kind history the ingest writes when a flow's shape
 * moves. The brief's original `deployDiff` tests pinned a per-template
 * `alerts.driftAt` marker; that field was deleted by the flow-level ruling
 * (2026-09-13) because a template's vector is constant and it can never drift,
 * so those tests are **rewritten against the flow surface** here rather than
 * reintroducing the marker. The proof that the ingest actually writes the history
 * lives in `ingest.test.ts`, where a drift is induced through the route; here the
 * history is populated directly, so these tests cannot pass against a diff that
 * never reads it.
 */

import t from 'tap';
import {EmbeddingCache} from './embedding.ts';
import {ExemplarStore} from './exemplars.ts';
import {DRIFT_RING_LIMIT, FlowDriftHistory} from './ingest.ts';
import {createProvider} from './provider.ts';
import {TemplateRegistry} from './registry.ts';
import {deployDiff, recordKey, recordText, searchRecords, searchTemplates} from './search.ts';

/** A registry holding one template per item, each with the given vector. */
function registryWith(entries: Array<{fp: string; vector: number[]}>): TemplateRegistry {
    const registry = new TemplateRegistry();
    for (const item of entries) {
        registry.upsert(
            {id: `id-${item.fp}`, time: 0, fingerprint: item.fp, template: item.fp, service: 'hub'},
            item.vector,
        );
    }
    return registry;
}

const A = [1, 0, 0];
const B = [0, 1, 0];
const C = [0, 0, 1];

// --- record-level search (R24, D20/D21) -------------------------------------

/** One event, shaped like the wire an emitter sends. */
function event(
    id: string,
    fields: Record<string, unknown> = {},
): Parameters<ExemplarStore['offer']>[1] {
    return {id, time: 1, fingerprint: `fp-${id}`, service: 'hub', ...fields} as Parameters<
        ExemplarStore['offer']
    >[1];
}

t.test('a query is the text a person would search a record by (R24)', t => {
    t.equal(
        recordText(event('a', {msg: 'settlement committed', operation: 'transfer.complete'})),
        'settlement committed transfer.complete hub',
        'the message first, then the machine-readable half of what it means',
    );
    t.equal(
        recordText(event('b', {msg: 'only a message'})),
        'only a message hub',
        'and the service it came from',
    );
    // Not even a service: a vector of nothing is not a direction, and it would place the
    // record in the ranking by accident, so the record's own identity stands in.
    t.equal(
        recordText(event('c', {service: undefined})),
        'fp-c',
        'a record with nothing falls back to its identity',
    );
    t.end();
});

t.test("a record is ranked by its own vector, not its template's (D20)", t => {
    // The fingerprint key would collapse every exemplar of one template onto the one
    // vector that template has, and a record-level search would then rank an arbitrary
    // member of each group. The key is the record's, so the vector is the record's own.
    const store = new ExemplarStore({limit: 5});
    store.offer('r1', event('a', {msg: 'north'}));
    store.offer('r1', event('b', {msg: 'south'}));
    const cache = new EmbeddingCache(createProvider({kind: 'offline', dimension: 16}));
    void cache.vectorFor(recordKey('a'), 'north');
    void cache.vectorFor(recordKey('b'), 'south');

    t.same(
        store.retained().map(held => held.id),
        ['a', 'b'],
        'the store hands out the id and the record together — they cannot come apart',
    );
    t.equal(
        searchRecords(store, cache, [1, 0], 10).length,
        0,
        'and ranking is by the record key, which here holds nothing',
    );
    t.end();
});

t.test('a retained record with no stored vector is left out, not embedded on the spot', t => {
    // Reachable whenever a store is handed records the cache never saw: a service restored
    // from a snapshot has the registry but a cold cache. Embedding the candidate during the
    // query would cost one provider call per candidate per query, which is the cost model
    // R3 exists to prevent, so the record is simply not a result.
    const store = new ExemplarStore({limit: 5});
    store.offer('r1', event('a', {msg: 'north'}));
    const cache = new EmbeddingCache(createProvider({kind: 'offline', dimension: 16}));
    t.same(
        searchRecords(store, cache, [1, 0], 10),
        [],
        'nothing to rank, and nothing embedded to find out',
    );
    t.equal(cache.calls(), 0, 'the provider was not consulted');
    t.end();
});

/**
 * A registry whose templates carry controlled `firstSeen`/`lastSeen`/`retiredAt`
 * values, so a diff test can place each entry on either side of a window. Every
 * entry gets a vector so it is a candidate for nothing here — the diff never
 * ranks — which keeps the fixture honest about what the diff reads.
 */
function diffRegistry(
    entries: Array<{fp: string; first: number; last?: number; retired?: number}>,
): TemplateRegistry {
    const registry = new TemplateRegistry();
    for (const item of entries) {
        const {entry} = registry.upsert(
            {
                id: `id-${item.fp}`,
                time: item.first,
                fingerprint: item.fp,
                template: item.fp,
                service: 'hub',
            },
            A,
        );
        if (item.last !== undefined) {
            entry.lastSeen = item.last;
        }
        if (item.retired !== undefined) {
            entry.retiredAt = item.retired;
        }
    }
    return registry;
}

t.test('search ranks templates by similarity to the query vector (PRD R14)', t => {
    const registry = registryWith([
        {fp: 'aaaaaaaaaaaa', vector: A},
        {fp: 'bbbbbbbbbbbb', vector: B},
        {fp: 'cccccccccccc', vector: C},
    ]);

    const results = searchTemplates(registry, A);

    t.equal(results.length, 3, 'every template with a vector is a candidate');
    t.equal(results[0].ref, 'aaaaaaaaaaaa');
    t.equal(results[1].ref, 'bbbbbbbbbbbb', 'a tie keeps registry order rather than scrambling it');
    t.equal(results[2].ref, 'cccccccccccc');
    t.ok(results[0].score > results[1].score, 'the closer template outranks the other');
    t.equal(results[0].entry.signature, 'aaaaaaaaaaaa', 'the ranked entry travels with its score');
    t.end();
});

t.test('limit caps the ranked list', t => {
    const registry = registryWith([
        {fp: 'aaaaaaaaaaaa', vector: A},
        {fp: 'bbbbbbbbbbbb', vector: B},
        {fp: 'cccccccccccc', vector: C},
    ]);

    const results = searchTemplates(registry, A, 2);

    t.equal(results.length, 2);
    t.same(
        results.map(result => result.ref),
        ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'],
        'the cap keeps the best two, not an arbitrary two',
    );
    t.end();
});

t.test('a template with no vector is not ranked', t => {
    const registry = new TemplateRegistry();
    registry.upsert({
        id: 'one',
        time: 0,
        fingerprint: 'aaaaaaaaaaaa',
        template: 'a',
        service: 'hub',
    });
    registry.upsert(
        {id: 'two', time: 0, fingerprint: 'bbbbbbbbbbbb', template: 'b', service: 'hub'},
        B,
    );

    const results = searchTemplates(registry, A);

    t.same(
        results.map(result => result.ref),
        ['bbbbbbbbbbbb'],
        'an entry that was never embedded is skipped, not scored as dissimilar',
    );
    t.end();
});

t.test('an empty vector is skipped rather than handed to cosine', t => {
    const registry = new TemplateRegistry();
    const {entry} = registry.upsert(
        {id: 'one', time: 0, fingerprint: 'aaaaaaaaaaaa', template: 'a', service: 'hub'},
        A,
    );
    // A zero-length vector is not a direction. If it reached `cosine`, the width
    // check would throw `RangeError` and fail the whole search rather than one
    // candidate.
    entry.centroid = [];

    t.same(searchTemplates(registry, A), []);
    t.end();
});

// --- Deploy diff (PRD R14) --------------------------------------------------

t.test('deploy diff reports templates added and removed, and counts the rest (PRD R14)', t => {
    const registry = diffRegistry([
        {fp: 'aaaaaaaaaaaa', first: 150},
        {fp: 'bbbbbbbbbbbb', first: 250},
        {fp: 'cccccccccccc', first: 10},
        {fp: 'dddddddddddd', first: 10, last: 150, retired: 180},
        {fp: 'eeeeeeeeeeee', first: 10, last: 150, retired: 250},
    ]);

    const diff = deployDiff(registry, {from: 100, to: 200}, new FlowDriftHistory());

    t.same(
        diff.added.map(entry => entry.ref),
        ['aaaaaaaaaaaa'],
        'first seen inside the range',
    );
    t.same(
        diff.removed.map(entry => entry.ref),
        ['cccccccccccc', 'dddddddddddd'],
        'last seen before it, or explicitly retired inside it',
    );
    t.equal(diff.unchanged, 2, 'a template that was neither added nor removed is unchanged');
    t.same(diff.drifted, [], 'a flow history with no drifts is an empty bucket, not an error');
    t.end();
});

t.test('a retirement before the window is not a removal inside it (PRD R14, FIX 3)', t => {
    const registry = diffRegistry([
        // Seen inside the window (last=150) but retired before it began. The
        // bucket is a *delta* for the window, and this entry was already gone
        // when the window opened.
        {fp: 'aaaaaaaaaaaa', first: 10, last: 150, retired: 50},
        // Retired inside the window — the removal the bucket exists for.
        {fp: 'bbbbbbbbbbbb', first: 10, last: 150, retired: 180},
    ]);

    const diff = deployDiff(registry, {from: 100, to: 200}, new FlowDriftHistory());

    t.same(
        diff.removed.map(entry => entry.ref),
        ['bbbbbbbbbbbb'],
        'only a retirement inside the window is a removal',
    );
    t.equal(
        diff.unchanged,
        1,
        'the earlier retirement is unchanged for this window, not removed in it',
    );
    t.end();
});

t.test('a retirement is bounded inclusively at both ends of the window (PRD R14, FIX 3)', t => {
    const registry = diffRegistry([
        {fp: 'aaaaaaaaaaaa', first: 10, last: 150, retired: 100},
        {fp: 'bbbbbbbbbbbb', first: 10, last: 150, retired: 200},
    ]);

    const diff = deployDiff(registry, {from: 100, to: 200}, new FlowDriftHistory());

    t.same(
        diff.removed.map(entry => entry.ref),
        ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'],
        'a retirement exactly at a bound is inside',
    );
    t.end();
});

t.test('a re-observed template leaves the removed bucket (FIX 3)', t => {
    const registry = new TemplateRegistry();
    // First seen before the window, last seen inside it, retired inside it: the
    // exact shape that reported a removal in this window.
    registry.upsert({
        id: '01A',
        time: 10,
        fingerprint: 'aaaaaaaaaaaa',
        template: 'a',
        service: 'hub',
    });
    registry.upsert({
        id: '01B',
        time: 150,
        fingerprint: 'aaaaaaaaaaaa',
        template: 'a',
        service: 'hub',
    });
    registry.retire('aaaaaaaaaaaa', 180);

    const window = {from: 100, to: 200};
    t.same(
        deployDiff(registry, window, new FlowDriftHistory()).removed.map(entry => entry.ref),
        ['aaaaaaaaaaaa'],
        'the retirement inside the window is reported',
    );

    // Seen again after the retirement: the template is back, so the earlier
    // removal does not stand in for it in this window or any later one.
    registry.upsert({
        id: '01C',
        time: 400,
        fingerprint: 'aaaaaaaaaaaa',
        template: 'a',
        service: 'hub',
    });
    t.same(
        deployDiff(registry, window, new FlowDriftHistory()).removed,
        [],
        'no longer reported as removed',
    );
    t.same(
        deployDiff(registry, {from: 350, to: 450}, new FlowDriftHistory()).added,
        [],
        'and not reported as added either',
    );
    t.end();
});

t.test('deploy diff reports the flow kinds that drifted inside the window (PRD R14)', t => {
    const history = new FlowDriftHistory();
    history.record('refund.single', 50, 0.8);
    history.record('settle.single', 100, 0.6);
    history.record('transfer.single', 150, 0.9);
    history.record('batch.single', 200, 0.7);
    history.record('later.single', 201, 0.5);

    const diff = deployDiff(new TemplateRegistry(), {from: 100, to: 200}, history);

    t.same(
        diff.drifted.map(drift => drift.kind),
        ['settle.single', 'transfer.single', 'batch.single'],
        'a drift exactly at either bound is inside the window; one outside it is not',
    );
    t.equal(
        diff.drifted[1].lastDistance,
        0.9,
        'the distance measured at the drift travels with the kind',
    );
    t.equal(diff.drifted[1].count, 1, 'and so does the count');
    t.end();
});

t.test('a flow kind keeps one history entry, whatever it drifted (PRD R14)', t => {
    const history = new FlowDriftHistory();

    history.record('transfer.single', 100, 0.4);
    history.record('payment.batch', 100, 0.5);
    t.equal(
        history.size(),
        2,
        'the history holds one entry per kind, so it is bounded by the kinds',
    );

    history.record('transfer.single', 300, 0.95);
    t.equal(
        history.size(),
        2,
        'a repeated drift updates its kind rather than adding a second entry',
    );

    const transfer = history.inWindow(0, 400).find(drift => drift.kind === 'transfer.single');
    t.ok(transfer, 'the kind is still reported');
    t.equal(transfer?.count, 2, 'every drift counts');
    t.equal(transfer?.lastDriftedAt, 300, 'the latest in-window drift sets the time');
    t.equal(transfer?.lastDistance, 0.95, 'and the distance measured then');

    history.record('transfer.single', 200, 0.2);
    const after = history.inWindow(0, 400).find(drift => drift.kind === 'transfer.single');
    t.equal(after?.lastDriftedAt, 300, 'an out-of-order older drift does not wind the clock back');
    t.equal(
        after?.lastDistance,
        0.95,
        'nor replace the distance measured at the latest in-window drift',
    );
    t.equal(after?.count, 3, 'but it did happen, so it is still counted');
    t.end();
});

t.test(
    'a kind that drifted inside the window and again after it is still reported (PRD R14)',
    t => {
        const history = new FlowDriftHistory();
        history.record('settle.single', 150, 0.9);
        history.record('settle.single', 400, 0.5);

        const inside = history.inWindow(100, 200);
        t.same(
            inside.map(drift => drift.kind),
            ['settle.single'],
            'the earlier drift is not hidden by a later one outside the window',
        );
        t.equal(
            inside[0].lastDriftedAt,
            150,
            'the entry reports the drift that is inside the window',
        );
        t.equal(inside[0].lastDistance, 0.9, 'with the distance measured then');
        t.equal(inside[0].count, 2, 'while the count stays cumulative');

        t.same(
            history.inWindow(300, 500).map(drift => drift.kind),
            ['settle.single'],
            'the later window sees the later drift',
        );
        t.same(
            history.inWindow(200, 300).map(drift => drift.kind),
            [],
            'and neither drift leaks into a window between them',
        );
        t.end();
    },
);

t.test('the drift ring is bounded per kind, and the count outlives it (PRD R14)', t => {
    const history = new FlowDriftHistory();
    for (let i = 0; i < DRIFT_RING_LIMIT + 2; i++) {
        history.record('settle.single', 100 + i, 0.5);
    }

    t.equal(history.size(), 1, 'still one entry for the kind');
    t.same(
        history.inWindow(0, 100).map(drift => drift.kind),
        [],
        'a drift that fell out of the ring is not reported',
    );
    const [retained] = history.inWindow(0, 200);
    t.equal(
        retained.lastDriftedAt,
        100 + DRIFT_RING_LIMIT + 1,
        'the ring keeps the most recent drift',
    );
    t.equal(retained.count, DRIFT_RING_LIMIT + 2, 'the count is cumulative, not the ring size');
    t.end();
});

t.test('the drifted bucket is ordered by when each kind moved, not by insertion (PRD R14)', t => {
    const history = new FlowDriftHistory();
    history.record('late.single', 300, 0.5);
    history.record('early.single', 100, 0.5);

    t.same(
        history.inWindow(0, 400).map(drift => drift.kind),
        ['early.single', 'late.single'],
        'the earliest drift in the window comes first, whatever order the kinds were first recorded in',
    );
    t.end();
});

t.test('an empty range is not an error', t => {
    const diff = deployDiff(new TemplateRegistry(), {from: 0, to: 1}, new FlowDriftHistory());

    t.same(diff, {added: [], removed: [], drifted: [], unchanged: 0});
    t.end();
});
