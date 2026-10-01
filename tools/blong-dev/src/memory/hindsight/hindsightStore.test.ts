/**
 * Unit tests for the Hindsight adapter (`hindsightStore.ts`).
 *
 * The client is injected, so nothing here touches the network: what is asserted is
 * the contract the rest of the CLI relies on — ingestion is queued rather than
 * awaited, filters and limits reach the server, deletion is per document, and a
 * failure is returned as a reason instead of thrown, because a memory write must
 * survive an unreachable index.
 */

import {test} from 'tap';

import type {IHindsightConfig} from './hindsightConfig.ts';
import type {IHindsightDocument} from './hindsightDocument.ts';
import {
    type ClientLoader,
    type HindsightClientLike,
    createHindsightStore,
    failureReason,
    recallHit,
    retainItem,
} from './hindsightStore.ts';

const CONFIG: IHindsightConfig = {enabled: true, url: 'http://hindsight:8888', bank: 'blong'};

interface ICalls {
    retain: Array<{bank: string; items: Array<Record<string, unknown>>; options: unknown}>;
    recall: Array<{bank: string; query: string; options: Record<string, unknown>}>;
    deleted: string[];
}

function document(id = 'F-001'): IHindsightDocument {
    return {
        documentId: id,
        content: `### ${id} — something\n\nBody.`,
        context: `friction entry ${id} in .github/memory/friction.md`,
        tags: ['memory', 'kind:friction', `id:${id}`],
        metadata: {id, kind: 'friction', path: '.github/memory/friction.md'},
        timestamp: '2026-01-02T00:00:00Z',
    };
}

/** A client that records what it was asked to do. */
function fakeClient(
    calls: ICalls,
    behaviour: {results?: unknown[]; fail?: Error} = {},
): HindsightClientLike {
    return {
        retainBatch: async (
            bank: string,
            items: Array<Record<string, unknown>>,
            options: unknown,
        ) => {
            if (behaviour.fail) throw behaviour.fail;
            calls.retain.push({bank, items, options});
            return {success: true};
        },
        recall: async (bank: string, query: string, options: Record<string, unknown>) => {
            if (behaviour.fail) throw behaviour.fail;
            calls.recall.push({bank, query, options});
            return {results: behaviour.results ?? []};
        },
        deleteDocument: async (_bank: string, documentId: string) => {
            if (behaviour.fail) throw behaviour.fail;
            calls.deleted.push(documentId);
            return {};
        },
    } as unknown as HindsightClientLike;
}

function recorder(behaviour: {results?: unknown[]; fail?: Error} = {}): {
    calls: ICalls;
    load: ClientLoader;
} {
    const calls: ICalls = {retain: [], recall: [], deleted: []};
    return {calls, load: async () => fakeClient(calls, behaviour)};
}

test('the index is switched off by configuration, not by a failed call', async t => {
    t.equal(createHindsightStore({...CONFIG, enabled: false}), null, 'no store at all');
    t.end();
});

test('retain queues the batch instead of waiting for it', async t => {
    const {calls, load} = recorder();
    const store = createHindsightStore(CONFIG, load)!;

    const outcome = await store.retain([document()]);
    t.equal(outcome.ok, true, 'accepted');
    t.equal(calls.retain.length, 1, 'one call for the batch');
    t.equal(calls.retain[0]!.bank, 'blong', 'the configured bank');
    t.equal(calls.retain[0]!.items[0]!['document_id'], 'F-001', 'the entry id upserts');
    t.equal(
        (calls.retain[0]!.options as {async?: boolean}).async,
        true,
        'queued, so a write does not wait for extraction',
    );
    t.end();
});

test('retain does nothing when there is nothing to retain', async t => {
    const {calls, load} = recorder();
    const outcome = await createHindsightStore(CONFIG, load)!.retain([]);
    t.equal(outcome.ok, true);
    t.equal(calls.retain.length, 0, 'no call made');
    t.end();
});

test('a client that cannot be loaded is a reason, not a crash', async t => {
    const store = createHindsightStore(CONFIG, async () => {
        throw new Error('Cannot find module @vectorize-io/hindsight-client');
    })!;

    const outcome = await store.retain([document()]);
    t.equal(outcome.ok, false, 'reported as a failure');
    if (!outcome.ok) t.match(outcome.reason, /client unavailable/, 'the reason names the cause');
    t.end();
});

test('a call that fails is reported with its message', async t => {
    const {load} = recorder({fail: new Error('connect ECONNREFUSED 127.0.0.1:8888')});
    const outcome = await createHindsightStore(CONFIG, load)!.retain([document()]);
    t.equal(outcome.ok, false);
    if (!outcome.ok) t.match(outcome.reason, /ECONNREFUSED/);
    t.end();
});

test('recall filters by tags, strictly, and trims to the requested count', async t => {
    const results = Array.from({length: 3}, (_, index) => ({
        text: `fact ${index}`,
        document_id: `F-00${index}`,
        tags: ['memory'],
        scores: {final: 0.9 - index / 10, semantic: 0.6 - index / 100},
    }));
    const {calls, load} = recorder({results});
    const store = createHindsightStore(CONFIG, load)!;

    const outcome = await store.recall('connection pool', {
        tags: ['memory', 'kind:friction'],
        limit: 2,
    });
    t.equal(outcome.ok, true, 'search succeeded');
    t.equal(calls.recall[0]!.query, 'connection pool', 'the query is passed through');
    t.same(
        calls.recall[0]!.options['tags'],
        ['memory', 'kind:friction'],
        'filters become tags, the only thing recall can filter on',
    );
    t.equal(
        calls.recall[0]!.options['tagsMatch'],
        'all_strict',
        'every tag must be present, so a foreign document cannot surface',
    );
    if (outcome.ok) {
        t.equal(outcome.hits.length, 2, 'trimmed to --limit');
        t.equal(outcome.hits[0]!.similarity, 0.6, 'the calibrated number a reader is shown');
        t.equal(outcome.hits[0]!.score, 0.9, 'the ranking score is kept for --json');
        t.equal(outcome.hits[0]!.documentId, 'F-000', 'the source document is kept');
    }
    t.end();
});

test('a search with no filter asks for everything', async t => {
    const {calls, load} = recorder();
    await createHindsightStore(CONFIG, load)!.recall('anything');
    t.notOk('tags' in calls.recall[0]!.options, 'no tag filter is sent');
    t.end();
});

test('remove deletes one document per entry', async t => {
    const {calls, load} = recorder();
    const outcome = await createHindsightStore(CONFIG, load)!.remove(['F-001', 'T-002']);
    t.equal(outcome.ok, true);
    t.same(calls.deleted, ['F-001', 'T-002'], 'both documents deleted');
    t.end();
});

test('retainItem carries the key and drops an absent timestamp', async t => {
    const item = retainItem(document());
    t.equal(item.document_id, 'F-001');
    t.equal(item.timestamp, '2026-01-02T00:00:00Z');

    const {timestamp, ...withoutDate} = document();
    t.notOk('timestamp' in retainItem(withoutDate as IHindsightDocument));
    t.ok(timestamp, 'the fixture did have a date');
    t.end();
});

test('recallHit reports a missing score as null', async t => {
    t.equal(recallHit({text: 'a'}).score, null);
    t.equal(recallHit({text: 'a'}).similarity, null, 'no semantic arm, no similarity');
    t.equal(recallHit({text: 'a', scores: {final: 0.25, semantic: 0.7}}).score, 0.25);
    t.equal(
        recallHit({text: 'a', scores: {final: 0.25, semantic: 0.7}}).similarity,
        0.7,
        'the semantic arm is the readable number',
    );
    t.equal(recallHit({text: 'a', scores: null}).score, null);
    t.end();
});

test('a timeout is reported as a timeout, not as a stack trace', async t => {
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), {
        name: 'TimeoutError',
    });
    t.equal(failureReason(timeout, 2_000), 'no answer within 2s');
    t.equal(failureReason(new Error('boom'), 2_000), 'boom');
    t.end();
});
