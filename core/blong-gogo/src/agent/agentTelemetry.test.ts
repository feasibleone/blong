import {test} from 'tap';

import {agentTelemetry, TELEMETRY_BATCH} from './agentTelemetry.ts';

/**
 * The hand-off from a kind to the realm, pinned (`@@D-994`).
 *
 * What matters is the number of dispatches a token stream costs and that nothing is lost at the end
 * of a run: ten deltas inside the window are one batch, the size limit sends without waiting for
 * the window, and the run's last events leave even when its window never closed.
 */
const wait = (ms = 10): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

type Batch = {sessionId: string; events: Array<{seq: number; kind: string; payload?: unknown}>};

const collector = (): {
    batches: Batch[];
    dispatch: (params: Record<string, unknown>) => Promise<unknown>;
} => {
    const batches: Batch[] = [];
    return {
        batches,
        dispatch: async (params: Record<string, unknown>) => {
            batches.push(params as unknown as Batch);
            return {accepted: true};
        },
    };
};

test('deltas inside the window leave as one batch', async t => {
    const {batches, dispatch} = collector();
    const telemetry = agentTelemetry(
        dispatch,
        {method: 'agent.telemetry.insert', sessionId: 's-1'},
        {maxWaitMs: 5, maxEvents: 64},
    );
    for (let index = 0; index < 10; index++) telemetry.report('message', {text: `d${index}`});
    t.equal(batches.length, 0, 'nothing leaves before the window closes');
    await wait(30);
    t.equal(batches.length, 1, 'ten deltas are one dispatch');
    t.equal(batches[0].sessionId, 's-1', 'the batch names its session');
    t.same(
        batches[0].events.map(event => event.seq),
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        'numbered in the order the engine reported them',
    );
    t.same(
        batches[0].events.map(event => event.kind),
        Array.from({length: 10}, () => 'message'),
        'and all of one kind',
    );
    t.ok(
        batches[0].events.every(event => typeof event.payload === 'object'),
        'each with its delta',
    );
    await telemetry.flush();
});

test('the size limit sends without waiting for the window', async t => {
    const {batches, dispatch} = collector();
    const telemetry = agentTelemetry(
        dispatch,
        {method: 'agent.telemetry.insert', sessionId: 's-2'},
        {maxWaitMs: 5_000, maxEvents: 3},
    );
    for (let index = 0; index < 3; index++) telemetry.report('reasoning', {text: `r${index}`});
    await telemetry.flush();
    t.equal(batches.length, 1, 'three events fill a batch of three');
    t.equal(batches[0].events.length, 3, 'which leaves whole');
    t.equal(
        batches[0].events[2].seq,
        2,
        'a full batch does not wait for a timer that is an hour away',
    );
});

test('flush sends what is buffered when the run ends', async t => {
    const {batches, dispatch} = collector();
    const telemetry = agentTelemetry(
        dispatch,
        {method: 'agent.telemetry.insert', sessionId: 's-3'},
        {maxWaitMs: 5_000, maxEvents: 64},
    );
    telemetry.report('status', {state: 'running'});
    telemetry.report('status', {state: 'finished'});
    t.equal(batches.length, 0, 'the window has not closed');
    await telemetry.flush();
    t.equal(batches.length, 1, 'the run’s end is a flush');
    t.equal(batches[0].events.length, 2, 'with both events in it');
});

test('a batch that cannot be dispatched is dropped, and the next one still goes', async t => {
    const batches: Batch[] = [];
    let attempt = 0;
    const telemetry = agentTelemetry(
        async (params: Record<string, unknown>) => {
            attempt += 1;
            if (attempt === 1) throw new Error('the topic is gone');
            batches.push(params as unknown as Batch);
            return undefined;
        },
        {method: 'agent.telemetry.insert', sessionId: 's-4'},
        {maxWaitMs: 5, maxEvents: 64},
    );
    telemetry.report('message', {text: 'first'});
    await wait(30);
    telemetry.report('message', {text: 'second'});
    await telemetry.flush();
    t.equal(attempt, 2, 'the failed batch was attempted once and not retried');
    t.equal(batches.length, 1, 'and the batch after it still arrived');
    t.equal(
        batches[0].events[0].payload && (batches[0].events[0].payload as {text: string}).text,
        'second',
    );
});

test('an engine that was asked for no feed reports into nothing', async t => {
    let called = 0;
    const telemetry = agentTelemetry(async () => {
        called += 1;
        return undefined;
    }, undefined);
    telemetry.report('message', {text: 'unheard'});
    await telemetry.flush();
    t.equal(called, 0, 'no dispatch without an eventDispatch');
    t.equal(TELEMETRY_BATCH.maxEvents, 64, 'and the default batch is the one the plan names');
});
