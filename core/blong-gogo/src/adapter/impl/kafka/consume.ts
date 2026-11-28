/**
 * Reading records: the batch read an explorer asks for, and the long watch a page opens.
 */
import type {IMeta, VocabularyProxy} from '@feasibleone/blong/types';
import type {Message} from 'node-rdkafka';

import {freshGroup, type IKafkaClients, type KafkaConfig, messageOf, whenReady} from './clients.ts';

/**
 * A consumed record, narrowed to the fields an operator reads.
 *
 * The bytes stay bytes: which codec a topic's payload needs is the caller's business, and the
 * adapter has no opinion about one (`@@T-786`).
 */
export interface IKafkaRecord {
    topic: string;
    partition: number;
    offset: number;
    key?: string;
    value?: string;
    timestamp?: number;
}

export const recordOf = (message: Message): IKafkaRecord => ({
    topic: message.topic,
    partition: message.partition,
    offset: message.offset,
    key: message.key == null ? undefined : message.key.toString(),
    value: message.value == null ? undefined : message.value.toString(),
    timestamp: message.timestamp,
});

/**
 * Read one topic's messages with a consumer of its own.
 *
 * A fresh consumer group has to *join* before a read can return anything: the broker
 * holds a group's first rebalance for `group.initial.rebalance.delay.ms` (3s by
 * default), and a read issued before the assignment lands comes back empty for a topic
 * that has messages — which is how the commander's `message` level read empty while
 * `topic.list` listed the topic right beside it (D-497). So the assignment is waited
 * for first, exactly as `start()` waits for its own, and the consume timeout is what a
 * *fetch* gets rather than what a join gets.
 *
 * The promise always settles with an array: a rebalance stall, a broker error or the
 * deadline is an empty topic to the caller, never a malformed RPC response ("JSON RPC
 * response without response and error").
 */
export async function readTopicMessages(
    clients: IKafkaClients,
    connection: KafkaConfig,
    topic: string,
    limit: number,
    signal?: VocabularyProxy,
): Promise<Message[]> {
    const consumer = clients.consumer(
        {...connection, 'group.id': freshGroup('reader')},
        {'auto.offset.reset': 'earliest'},
    );
    // Long enough for a join on a loaded broker, short enough that an explorer's click is not left
    // waiting for a topic that has nothing to say.
    const joinDeadlineMs = 20_000;
    // What a fetch gets once the group owns its partitions.
    const consumeTimeoutMs = 5_000;
    const startedAt = Date.now();
    try {
        return await new Promise<Message[]>(resolve => {
            let settled = false;
            let poll: ReturnType<typeof setInterval> | null = null;
            let deadline: ReturnType<typeof setTimeout> | null = null;
            const finish = (messages: Message[]) => {
                if (settled) return;
                settled = true;
                if (poll) clearInterval(poll);
                if (deadline) clearTimeout(deadline);
                resolve(messages);
            };
            deadline = setTimeout(() => {
                signal?.frameworkKafkaTopicTimeout?.({
                    topic,
                    elapsedMs: Date.now() - startedAt,
                });
                finish([]);
            }, joinDeadlineMs);
            consumer.setDefaultConsumeTimeout(consumeTimeoutMs);
            consumer.on('event.error', error => {
                signal?.frameworkKafkaTopicFailed?.({topic, error: error?.message});
                finish([]);
            });
            consumer.on('ready', () => {
                consumer.subscribe([topic]);
                // The assignment is what the read waits for: until the group has joined,
                // `consume` reads partitions this consumer does not own yet and returns
                // an empty batch for a topic that has messages.
                poll = setInterval(() => {
                    if (consumer.assignments().length === 0) return;
                    if (poll) clearInterval(poll);
                    poll = null;
                    consumer.consume(limit, (error, messages) => {
                        if (error) {
                            signal?.frameworkKafkaTopicFailed?.({topic, error: error.message});
                            return finish([]);
                        }
                        signal?.frameworkKafkaTopicRead?.({
                            topic,
                            count: messages?.length ?? 0,
                            elapsedMs: Date.now() - startedAt,
                        });
                        finish(messages ?? []);
                    });
                }, 200);
            });
            consumer.connect();
        });
    } finally {
        try {
            consumer.disconnect();
        } catch {
            // A consumer that never connected has nothing to leave behind.
        }
    }
}

export interface IWatchStart {
    partition: number;
    offset: number;
}

/** A watch's starts, as a caller writes them: `[{partition, offset}]`, at least one. */
export function startsOf(value: unknown): IWatchStart[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error('Missing starts param: a watch needs a [{partition, offset}] list');
    }
    return value.map(entry => {
        const candidate = entry as {partition?: unknown; offset?: unknown};
        const partition = Number(candidate?.partition);
        const offset = Number(candidate?.offset);
        if (!Number.isInteger(partition) || !Number.isInteger(offset)) {
            throw new Error(
                `Invalid watch start ${JSON.stringify(entry)}: partition and offset are integers`,
            );
        }
        return {partition, offset};
    });
}

/**
 * `{ns}.topic.watch` — a partition's records from an offset, filtered by key (`@@T-786`).
 *
 * The consumer assigns its partitions and joins no group (`@@D-989`): a group join costs the
 * broker's initial rebalance delay on a click, and a viewer has nothing to commit — it starts from
 * an offset it was given and never owns one.
 *
 * A broker error ends this stream the way a broken socket ends a read. The caller that knows where
 * it got to reopens with its token (`@@T-780`); a watch that went quiet instead would leave a page
 * waiting on a broker that is not answering.
 */
export async function* topicWatch(
    clients: IKafkaClients,
    connection: KafkaConfig,
    options: {
        topic: string;
        starts: IWatchStart[];
        key?: string;
        $meta?: IMeta;
        /**
         * Where the owner of this watch keeps its close, so it can end one the reader abandoned.
         *
         * A reader that stops without an abort — a page closed, a generator dropped — leaves the
         * pump parked at an `await` that nothing resumes, and its `finally` therefore never runs
         * (`@@F-870`). The consumer would outlive the platform that started it, and a process with a
         * live client does not exit. The owner closes every watch it opened when it stops
         * (`@@D-1043`).
         */
        register?: (close: () => void) => void;
    },
): AsyncIterable<IKafkaRecord> {
    const queue: IKafkaRecord[] = [];
    let wake: (() => void) | null = null;
    let ended = false;
    let failure: Error | null = null;
    const nudge = (): void => {
        const waiting = wake;
        wake = null;
        waiting?.();
    };
    /**
     * Close the consumer, once.
     *
     * The close is deferred to the next turn of the loop, and it is the client's own blocking call:
     * `node-rdkafka` disconnects synchronously, which measured **1500 ms** here, so a reader that
     * leaves must not have its last frame — or the request that served it — held for that long. The
     * process is still busy when it runs; it is simply no longer busy *for the reader* (`F-834`).
     * Closing in the reader's own turn is not an option: a disconnect issued while the consumer is
     * still polling crashes librdkafka outright, which was a crash on every run that tried it.
     * A pool of assigned consumers is the fix when a viewer's watch becomes per-page rather than
     * per-session.
     */
    let closed = false;
    const close = (): void => {
        if (closed) return;
        closed = true;
        // Detached at once, so no record is dispatched into a queue nobody will drain while the
        // close waits its turn.
        try {
            consumer.off('data', onData);
        } catch {
            // A client already torn down has no listener to remove.
        }
        setImmediate(() => {
            try {
                // The assignment goes first: a consumer that still holds partitions asks the broker
                // to take them back while it is closing, and that teardown is what was left stalled
                // (`@@F-870`).
                consumer.unassign();
            } catch {
                // A consumer whose connection is already gone has no assignment to drop.
            }
            try {
                consumer.disconnect(() => undefined);
            } catch {
                // A consumer that never connected has nothing to leave behind.
            }
        });
    };
    const consumer = clients.consumer(
        {
            ...connection,
            // The id the client insists on. It is never used for coordination: this consumer
            // assigns its partitions and never subscribes, so there is no group to join.
            'group.id': freshGroup('watch'),
            'enable.auto.commit': false,
        },
        {'auto.offset.reset': 'earliest'},
    );
    consumer.on('data', onData);
    consumer.on('event.error', error => {
        failure = new Error(error.message ?? 'Kafka consumer error');
        ended = true;
        nudge();
    });
    function onData(message: Message): void {
        if (options.key !== undefined && message.key?.toString() !== options.key) return;
        queue.push(recordOf(message));
        nudge();
    }
    const abort = (): void => {
        ended = true;
        // The pump may be parked at a `yield` when this fires: an abort is the reader saying it
        // stopped reading, so nothing will resume the loop and its `finally` would never close the
        // consumer. The close is therefore the abort's own work, not the loop's.
        close();
        nudge();
    };
    options.$meta?.abort?.addEventListener('abort', abort, {once: true});
    // Known to the owner from the moment it can be closed, which is before the client connects:
    // a platform that stops during the connect must be able to end this watch.
    options.register?.(close);
    try {
        await whenReady(consumer);
        // The offsets are absolute and were computed by the caller from the watermarks, so nothing
        // here resets them: a reader that asked for `high - 500` gets exactly that.
        consumer.assign(
            options.starts.map(start => ({
                topic: options.topic,
                partition: start.partition,
                offset: start.offset,
            })),
        );
        // Without this the consumer polls nothing and the assignment delivers no `data` events —
        // the loop is the difference between an assignment and a read.
        consumer.consume();
        while (!ended || queue.length > 0) {
            const next = queue.shift();
            if (next) {
                yield next;
                continue;
            }
            await new Promise<void>(resolve => {
                wake = resolve;
            });
        }
        if (failure) throw failure;
    } finally {
        options.$meta?.abort?.removeEventListener('abort', abort);
        close();
    }
}

/** A topic read that failed, spelled the way a signal wants it (`@@T-783`). */
export const readFailureOf = (topic: string, error: unknown): {topic: string; error: string} => ({
    topic,
    error: messageOf(error),
});
