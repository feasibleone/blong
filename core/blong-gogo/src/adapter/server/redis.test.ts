import {test} from 'tap';

import {subWatch, type IRedisClient} from './redis.ts';

/** One turn of the loop, so a subscription has opened and its reader is parked. */
const tick = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

/**
 * A subscriber that behaves the way ioredis does for the one thing `subWatch` uses: it takes a
 * channel, it raises `message` for what arrives on it, and it is quitted when the reader leaves.
 */
class FakeSubscriber {
    readonly listened: string[] = [];
    readonly listeners = new Map<string, ((...args: unknown[]) => void)[]>();
    left = false;

    on(event: string, listener: (...args: unknown[]) => void): unknown {
        const listeners = this.listeners.get(event) ?? [];
        listeners.push(listener);
        this.listeners.set(event, listeners);
        return this;
    }

    emit(event: string, ...args: unknown[]): void {
        for (const listener of this.listeners.get(event) ?? []) listener(...args);
    }

    async subscribe(...channels: string[]): Promise<unknown> {
        this.listened.push(...channels);
        return channels.length;
    }

    async quit(): Promise<unknown> {
        this.left = true;
        return 'OK';
    }
}

const clientOf = (subscriber: FakeSubscriber): IRedisClient =>
    ({duplicate: () => subscriber}) as unknown as IRedisClient;

test('sub.watch subscribes to its channel and yields what arrives', async t => {
    const subscriber = new FakeSubscriber();
    const controller = new AbortController();
    const seen: string[] = [];
    const reading = (async () => {
        for await (const entry of subWatch(
            clientOf(subscriber),
            {channel: 'agent.wake'},
            {
                abort: controller.signal,
            },
        )) {
            seen.push(`${entry.channel}:${entry.message}`);
        }
    })();
    await tick();
    t.same(subscriber.listened, ['agent.wake'], 'the channel it was asked for');

    // Nothing about a message means anything here: the text is handed over as it is.
    subscriber.emit('message', 'agent.wake', JSON.stringify({sessionId: 's-1'}));
    subscriber.emit('message', 'agent.wake', 'not json');
    await tick();
    t.same(
        seen,
        ['agent.wake:{"sessionId":"s-1"}', 'agent.wake:not json'],
        'both messages, in the order they arrived',
    );

    controller.abort();
    await reading;
    // The close is put on the next turn of the loop, so the reader's own continuation runs first.
    await tick();
    t.ok(subscriber.left, 'the subscriber is gone once the reader has left');
    t.end();
});

test('sub.watch ends with the connection error that stopped it', async t => {
    const subscriber = new FakeSubscriber();
    const reading = (async () => {
        for await (const _entry of subWatch(clientOf(subscriber), {channel: 'agent.wake'})) {
            // no message arrives; the connection fails first
        }
    })();
    await tick();
    subscriber.emit('error', new Error('connection lost'));
    await t.rejects(reading, /connection lost/, 'the reader sees why the channel ended');
    t.end();
});

test('sub.watch refuses a call that names no channel', async t => {
    await t.rejects(
        (async () => {
            for await (const _entry of subWatch(clientOf(new FakeSubscriber()), {})) {
                // nothing: the call is refused before a subscriber is made
            }
        })(),
        /needs a channel/,
        'a watch with no channel is a mistake rather than an empty subscription',
    );
    t.end();
});
