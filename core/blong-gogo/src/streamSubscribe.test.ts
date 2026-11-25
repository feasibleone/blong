import {STREAM_TEXT_TYPE, subscribeStream, type IStreamResponse} from '@feasibleone/blong-mle';
import {test} from 'tap';

/**
 * The subscription that carries a resume token across attempts (`@@D-949`).
 *
 * `blong-mle` ships no test runner of its own — the reader it exports is tested here, in
 * `gatewayStreamRead.test.ts`, and this is the same arrangement for the helper built on it.
 */

/** A text-envelope response carrying these values and then ending. */
const responseOf = (values: unknown[]): IStreamResponse => ({
    headers: {'content-type': STREAM_TEXT_TYPE},
    body: new ReadableStream<Uint8Array>({
        start(controller) {
            const encoder = new TextEncoder();
            for (const value of values)
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
            controller.close();
        },
    }),
});

/** A stream that sends one value and then stays open. */
const openEnded = (value: unknown): IStreamResponse => ({
    headers: {'content-type': STREAM_TEXT_TYPE},
    body: new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`));
        },
    }),
});

type Step = {last: string; text: string};

test('a subscription carries the last token into the next attempt', async t => {
    const asked: (string | undefined)[] = [];
    const values: string[] = [];
    for await (const value of subscribeStream<Step>({
        open: async after => {
            asked.push(after);
            return asked.length === 1
                ? responseOf([
                      {last: '1', text: 'a'},
                      {last: '2', text: 'b'},
                  ])
                : responseOf([{last: '3', text: 'c'}]);
        },
        tokenOf: value => value.last,
        retries: 1,
    }))
        values.push(value.text);
    t.same(values, ['a', 'b', 'c'], 'both attempts are delivered, in order');
    t.same(
        asked,
        [undefined, '2'],
        'the second attempt asks for what follows the last value it saw',
    );
    t.end();
});

test('a repeat the route did not honour is not delivered twice', async t => {
    const asked: (string | undefined)[] = [];
    const values: string[] = [];
    for await (const value of subscribeStream<Step>({
        open: async after => {
            asked.push(after);
            return asked.length === 1
                ? responseOf([{last: '1', text: 'a'}])
                : responseOf([
                      {last: '1', text: 'a'},
                      {last: '2', text: 'b'},
                  ]);
        },
        tokenOf: value => value.last,
        retries: 1,
    }))
        values.push(value.text);
    t.same(values, ['a', 'b'], 'the value already seen is skipped, the new one is not');
    t.end();
});

test('a reader that leaves ends the subscription', async t => {
    const controller = new AbortController();
    const seen: Step[] = [];
    for await (const value of subscribeStream<Step>({
        open: async () => openEnded({last: '1', text: 'a'}),
        tokenOf: value => value.last,
        retries: 5,
        signal: controller.signal,
    })) {
        seen.push(value);
        controller.abort();
    }
    t.same(seen, [{last: '1', text: 'a'}], 'one value, and then the loop ends with the reader');
    t.end();
});

test('a subscription that keeps failing reports the last failure', async t => {
    let attempts = 0;
    await t.rejects(
        async () => {
            for await (const _value of subscribeStream<Step>({
                open: async () => {
                    attempts += 1;
                    throw new Error('the broker is not answering');
                },
                retries: 2,
                retryDelayMs: 1,
            }))
                t.fail('nothing should have been delivered');
        },
        /the broker is not answering/,
        'the failure is the caller’s to see',
    );
    t.equal(attempts, 3, 'after every attempt the budget allowed');
    t.end();
});
