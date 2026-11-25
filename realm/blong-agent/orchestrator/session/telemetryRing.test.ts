import {test} from 'tap';

import {
    telemetryRingAppend,
    telemetryRingRead,
    telemetryRingReset,
    telemetryRingWatch,
} from './telemetryRing.ts';

/**
 * The memory source a Playwright run watches (`@@D-988`, `@@D-1001`).
 *
 * It has to answer what a Kafka partition answers: a tail to start from, a cursor to resume after,
 * and a live sequence that ends when the reader leaves — otherwise the page would behave differently
 * in the one environment that has no broker.
 */
const event = (
    seq: number,
): {sessionId: string; seq: number; kind: 'message'; payload: object; at: number} => ({
    sessionId: 's-1',
    seq,
    kind: 'message',
    payload: {text: `m${seq}`},
    at: 1_700_000_000_000 + seq,
});

test('the ring reads a tail, then what came after a cursor', t => {
    telemetryRingReset('s-1');
    telemetryRingAppend('s-1', [event(0), event(1), event(2), event(3)]);
    t.same(
        telemetryRingRead('s-1', {tail: 2}).map(entry => entry.seq),
        [2, 3],
        'a tail is the last N events',
    );
    t.same(
        telemetryRingRead('s-1', {after: 1}).map(entry => entry.seq),
        [2, 3],
        'a cursor resumes after what the reader has already rendered',
    );
    t.same(telemetryRingRead('s-2'), [], 'a session nobody wrote has nothing to read');
    t.end();
});

test('a watcher sees what is appended after it opened, and stops when the reader leaves', async t => {
    telemetryRingReset('s-1');
    telemetryRingAppend('s-1', [event(0)]);
    const controller = new AbortController();
    const seen: number[] = [];
    const reading = (async () => {
        for await (const entry of telemetryRingWatch('s-1', {
            after: 0,
            signal: controller.signal,
        })) {
            seen.push(entry.seq);
            if (seen.length === 2) controller.abort();
        }
    })();
    await new Promise(resolve => setTimeout(resolve, 5));
    telemetryRingAppend('s-1', [event(1), event(2)]);
    await reading;
    t.same(seen, [1, 2], 'the live sequence carries what the reader had not seen');
    controller.abort();
    t.pass('a reader that left ends the sequence rather than holding the process');
    t.end();
});

test('the ring is capped rather than unbounded', t => {
    telemetryRingReset('s-1');
    const many = Array.from({length: 5_100}, (_, index) => event(index));
    telemetryRingAppend('s-1', many);
    const tail = telemetryRingRead('s-1', {tail: 5_000});
    t.equal(tail.length, 5_000, 'the oldest events are dropped once the ring is full');
    t.equal(tail[tail.length - 1].seq, 5_099, 'and the newest are kept');
    t.end();
});
