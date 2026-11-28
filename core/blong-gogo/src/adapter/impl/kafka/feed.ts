/**
 * A background feed: one consumer reading a topic set, each record dispatched as a call, and the
 * commits that follow the work (`@@D-1036`).
 *
 * The loop itself is the framework's — the same one a stream instance reads its answers through.
 * What lives here is the part that cannot be the loop's: which record is in flight, when a commit
 * may pass it, and what happens to one that keeps failing.
 */
import type {IMeta, VocabularyProxy} from '@feasibleone/blong/types';
import {Duplex} from 'stream';

import {
    freshGroup,
    type IKafkaClients,
    type IKafkaHeader,
    type KafkaConfig,
    type Message,
    messageOf,
    metadataOf,
    whenReady,
} from './clients.ts';
import {
    DEFAULT_ATTEMPTS,
    DEFAULT_COMMIT,
    DEFAULT_CONCURRENCY,
    type IFeedSpec,
    patternMatches,
} from './config.ts';
import {brokerTopicOf, logicalTopicOf, physicalGroupOf} from './names.ts';

/** What one feed is told about the adapter it runs in (`@@D-1036`). */
export interface IFeedOptions {
    alias: string;
    spec: IFeedSpec;
    config: {tenant?: unknown; namespace?: string | string[]};
    clients: IKafkaClients;
    connection: KafkaConfig;
    signal?: VocabularyProxy;
    /**
     * Where an answer, a retry or a dead letter is produced (`@@D-1035`).
     *
     * The feed never holds a producer of its own: the adapter resolves one from its `producer` map
     * by the topic the record names, exactly as it does for a stream's answer.
     */
    produce: (
        logicalTopic: string,
        message: {value: string; key?: string | null; headers?: IKafkaHeader[]},
    ) => Promise<unknown>;
    /** Install the loop the feed reads through — the `connect(…, {outbound: false})` seam. */
    connect: (
        stream: Duplex,
        afterDispatch: (
            frame: unknown,
            packet: unknown[],
            outcome: unknown[] | undefined,
        ) => Promise<void>,
        decode: (frame: unknown, $meta: IMeta) => Promise<unknown>,
    ) => unknown;
    /**
     * Read one record into the packet it stands for (`@@D-1036`).
     *
     * The instance's codec, which fills `$meta.method` and `$meta.mtid` — the record *is* a call.
     * The feed decodes rather than the loop because an `admin` instance cannot carry a `decode` on
     * its port: the same function would read the answers `exec` returns.
     */
    decode: (frame: unknown, $meta: IMeta) => Promise<unknown>;
    /**
     * Encode one answer, when the port does not carry a codec of its own (`@@D-1036`).
     *
     * A stream instance sets `encode` on the port, so the loop hands the feed an encoded message.
     * An `admin` instance cannot — the same function would encode the values `exec` returns — so the
     * loop hands it the dispatch result and the feed encodes it here. That is what lets a feed
     * answer from an instance that serves no stream, routed like any other answer: through the
     * producer the topic resolves to.
     */
    encode?: (value: unknown, $meta: IMeta) => Promise<unknown>;
}

export interface IFeedStats {
    processed: number;
    failed: number;
    deadLettered: number;
    committed: number;
}

/** The feed as the adapter keeps it: the consumer, the loop and the counters. */
export interface IFeedHandle {
    alias: string;
    groupId: string;
    topics: string[];
    stop(): Promise<void>;
    stats(): IFeedStats;
}

/** One partition's window: what has been seen, and what is still outstanding (`@@D-1036`). */
interface IPartitionWindow {
    /** The offset after the highest record seen — where a reader would resume. */
    seen: number;
    /** The offsets handed to the loop and not yet finished with. */
    outstanding: Set<number>;
}

const partitionKey = (topic: string, partition: number): string => `${topic}:${partition}`;
const recordKey = (topic: string, partition: number, offset: number): string =>
    `${topic}:${partition}:${offset}`;

/**
 * How long a failed record waits before it is tried again.
 *
 * Without it a record that keeps failing would re-enter the loop as fast as a microtask resolves —
 * a hot loop that starves the timers a commit and a shutdown need (`@@D-1036`).
 */
const RETRY_MS = 100;

/**
 * How long the broker has to confirm a commit before the feed moves on without it.
 *
 * A commit that never answers — a consumer mid-rebalance, a broker that went away — must not hold a
 * shutdown open: the stop is the one moment a feed cannot be allowed to hang (`@@D-1036`).
 */
const COMMIT_MS = 5_000;

/** How long a consumer is given to close before the feed stops waiting for it. */
const DISCONNECT_MS = 5_000;

/**
 * How long the commit of a stopping feed may take.
 *
 * Shorter than a running feed's, because a stop is what a process waits on to exit: the offsets a
 * commit does not carry are re-delivered on the next start rather than lost, so waiting longer buys
 * nothing but a slow shutdown (`@@D-1036`).
 */
const STOP_COMMIT_MS = 1_000;

/** A commit spec written as a count or as a pair, as the policy the feed runs. */
const commitOf = (commit: IFeedSpec['commit']): {every: number; ms: number} => {
    if (typeof commit === 'number') return {...DEFAULT_COMMIT, every: commit};
    return {
        every: commit?.every ?? DEFAULT_COMMIT.every,
        ms: commit?.ms ?? DEFAULT_COMMIT.ms,
    };
};

/**
 * The broker names a feed's patterns stand for (`@@D-1035`).
 *
 * A glob cannot be subscribed to, so it is expanded against the broker's own topic list and matched
 * on the **logical** name — the tenant and a `physical:` marker play no part in choosing a topic.
 * A literal pattern is kept even when the broker has no such topic yet: a feed that starts before
 * its topic exists must wait for it rather than refuse to start.
 */
async function expandTopics(
    config: {tenant?: unknown},
    clients: IKafkaClients,
    connection: KafkaConfig,
    patterns: string[],
): Promise<string[]> {
    const physical = (name: string): string => brokerTopicOf(config, name);
    const literal = patterns.filter(pattern => !/[*?]/.test(pattern)).map(physical);
    if (!patterns.some(pattern => /[*?]/.test(pattern))) return [...new Set(literal)];
    const consumer = clients.consumer(
        {...connection, 'group.id': freshGroup('feed-topics')},
        {'auto.offset.reset': 'earliest'},
    );
    try {
        await whenReady(consumer);
        const metadata = await metadataOf(consumer, 5_000);
        const held = (metadata.topics ?? [])
            .map(topic => topic.name)
            .filter(name => !name.startsWith('__'));
        const matched = patterns.flatMap(pattern =>
            held
                .filter(name => patternMatches(pattern, logicalTopicOf(config, name)))
                .map(name => physical(name)),
        );
        return [...new Set([...literal, ...matched])];
    } finally {
        try {
            consumer.disconnect();
        } catch {
            // A consumer that never connected has nothing to leave behind.
        }
    }
}

/**
 * Run one feed until `stop()` (`@@D-1036`).
 *
 * A record counts as in flight from the moment it is pushed into the loop until the loop reports
 * what became of it, which is what keeps `concurrency` honest: with one slot the commits arrive in
 * order for free, and with several the commit is the contiguous prefix — the lowest offset still
 * outstanding — so nothing is ever skipped by a crash.
 */
export async function openFeed(options: IFeedOptions): Promise<IFeedHandle> {
    const {spec, clients, connection, signal} = options;
    const config = options.config;
    const concurrency = spec.concurrency ?? DEFAULT_CONCURRENCY;
    const attempts = spec.attempts ?? DEFAULT_ATTEMPTS;
    const commit = commitOf(spec.commit);
    const groupId = physicalGroupOf(config, spec.groupId ?? `blong.feed.${options.alias}`);
    const consumer = clients.consumer(
        {
            ...connection,
            ...spec.config,
            'group.id': groupId,
            // Forced, not defaulted, and last so nothing can put them back: storing an offset on
            // delivery is precisely the skip this rules out (`@@D-1036`). A spec that asks for
            // either is refused when it is read, so this is the belt to that braces.
            'enable.auto.commit': false,
            'enable.auto.offset.store': false,
        },
        {'auto.offset.reset': 'earliest'},
    );
    const stats: IFeedStats = {processed: 0, failed: 0, deadLettered: 0, committed: 0};
    const windows = new Map<string, IPartitionWindow>();
    const pending = new Map<string, {topic: string; partition: number; offset: number}>();
    const attemptsOf = new Map<string, number>();
    const queue: Message[] = [];
    /** How many records the loop holds, per our own count — the loop never tells us. */
    let inFlight = 0;
    let sinceCommit = 0;
    let stopped = false;
    let flushTimer: ReturnType<typeof setInterval> | null = null;
    let flushing: Promise<void> | null = null;

    const logicalOf = (topic: string): string => logicalTopicOf(config, topic);

    /** Note the highest offset that may be committed for one partition (`@@D-1036`). */
    const noteFinished = (topic: string, partition: number, offset: number): void => {
        const key = partitionKey(topic, partition);
        const window = windows.get(key);
        if (!window) return;
        window.outstanding.delete(offset);
        const offsetToCommit = window.outstanding.size
            ? Math.min(...window.outstanding)
            : window.seen;
        if (offsetToCommit <= 0) return;
        pending.set(key, {topic, partition, offset: offsetToCommit});
    };

    const flush = async (budgetMs = COMMIT_MS): Promise<void> => {
        if (flushing) return flushing;
        if (pending.size === 0) return;
        const offsets = [...pending.values()];
        pending.clear();
        sinceCommit = 0;
        flushing = new Promise<void>(resolve => {
            let settled = false;
            let timer: ReturnType<typeof setTimeout> | null = null;
            const done = (error?: {message?: string} | null): void => {
                if (settled) return;
                settled = true;
                if (timer) clearTimeout(timer);
                if (error) {
                    signal?.frameworkKafkaFeedCommitFailed?.({
                        feed: options.alias,
                        error: error.message,
                    });
                    // The work is done and only the notice of it is lost: the offsets are kept so
                    // the next flush offers them again rather than the group resuming behind them.
                    for (const entry of offsets) {
                        const key = partitionKey(entry.topic, entry.partition);
                        const current = pending.get(key);
                        if (!current || current.offset < entry.offset) pending.set(key, entry);
                    }
                } else {
                    stats.committed += offsets.length;
                    signal?.frameworkKafkaFeedCommitted?.({
                        feed: options.alias,
                        count: offsets.length,
                    });
                }
                resolve();
            };
            timer = setTimeout(
                () => done({message: `Kafka did not confirm the commit in ${budgetMs}ms`}),
                budgetMs,
            );
            timer.unref?.();
            try {
                consumer.commit(offsets, error => done(error));
            } catch (error) {
                done({message: messageOf(error)});
            }
        }).finally(() => {
            flushing = null;
        });
        return flushing;
    };

    /** Push as much of the queue as the concurrency allows. */
    const pump = (): void => {
        while (!stopped && inFlight < concurrency && queue.length) {
            const message = queue.shift() as Message;
            const key = partitionKey(message.topic, message.partition);
            const window = windows.get(key) ?? {seen: 0, outstanding: new Set<number>()};
            window.seen = Math.max(window.seen, message.offset + 1);
            window.outstanding.add(message.offset);
            windows.set(key, window);
            inFlight += 1;
            stream.push(message);
        }
    };

    /** What a dead letter says about the record it carries (`@@D-1036`). */
    const deadLetterHeaders = (
        message: Message,
        error: unknown,
        attempt: number,
    ): IKafkaHeader[] => [
        {name: 'x-blong-error', value: Buffer.from(messageOf(error))},
        {name: 'x-blong-attempts', value: Buffer.from(String(attempt))},
        {name: 'x-blong-topic', value: Buffer.from(message.topic)},
        {name: 'x-blong-partition', value: Buffer.from(String(message.partition))},
        {name: 'x-blong-offset', value: Buffer.from(String(message.offset))},
        {name: 'x-blong-feed', value: Buffer.from(options.alias)},
    ];

    /** Put a record back to be tried again, after a pause rather than at once. */
    const retry = (message: Message): void => {
        setTimeout(() => {
            if (stopped) return;
            queue.unshift(message);
            pump();
        }, RETRY_MS).unref?.();
    };

    /**
     * Finish with one record, successfully or not (`@@D-1036`).
     *
     * A failure keeps the record outstanding until its attempts run out, because a commit that
     * passed it would lose it. The last attempt either dead-letters it — carrying its own bytes —
     * or leaves the window where it is and retries it, which is what a feed with no `deadLetter`
     * does: it retries without end rather than dropping what it cannot process.
     */
    const settle = async (message: Message, failure: Error | null): Promise<void> => {
        const key = recordKey(message.topic, message.partition, message.offset);
        if (!failure) {
            attemptsOf.delete(key);
            stats.processed += 1;
            sinceCommit += 1;
            noteFinished(message.topic, message.partition, message.offset);
            return;
        }
        stats.failed += 1;
        const attempt = (attemptsOf.get(key) ?? 0) + 1;
        attemptsOf.set(key, attempt);
        signal?.frameworkKafkaFeedFailed?.({
            feed: options.alias,
            topic: logicalOf(message.topic),
            partition: message.partition,
            offset: message.offset,
            attempt,
            error: messageOf(failure),
        });
        if (attempt < attempts || !spec.deadLetter) {
            retry(message);
            return;
        }
        try {
            await options.produce(spec.deadLetter, {
                value: message.value?.toString() ?? '',
                key: message.key == null ? null : message.key.toString(),
                headers: deadLetterHeaders(message, failure, attempt),
            });
        } catch (deadLetterError) {
            // The dead letter itself failed, so the record is not finished: retrying is the only
            // honest answer, and its window keeps every later commit behind it.
            signal?.frameworkKafkaFeedCommitFailed?.({
                feed: options.alias,
                error: `dead letter refused ${logicalOf(message.topic)}[${message.partition}]@${message.offset}: ${messageOf(deadLetterError)}`,
            });
            retry(message);
            return;
        }
        stats.deadLettered += 1;
        attemptsOf.delete(key);
        // A dead-lettered record is finished too, so it counts toward the commit that has to
        // pass it — otherwise the group would resume at a record it has already disposed of.
        sinceCommit += 1;
        signal?.frameworkKafkaFeedDeadLettered?.({
            feed: options.alias,
            topic: logicalOf(message.topic),
            partition: message.partition,
            offset: message.offset,
            deadLetter: spec.deadLetter,
            attempts: attempt,
        });
        noteFinished(message.topic, message.partition, message.offset);
    };

    /**
     * What the loop says about a record it has just dispatched (`@@D-1036`).
     *
     * `outcome` is what the dispatch came to — absent when the handler answered nothing, a
     * `[value, $meta]` pair carrying `mtid: 'error'` when it threw. That is the whole of the feed's
     * signal: the packet it read is a request whatever happened to it, and the write is not a reply
     * at all, because a background handler usually answers nothing (`@@D-1036`).
     */
    const afterDispatch = async (
        frame: unknown,
        _packet: unknown[],
        outcome: unknown[] | undefined,
    ): Promise<void> => {
        inFlight = Math.max(0, inFlight - 1);
        const message = frame as Message;
        try {
            const meta = outcome?.[outcome.length - 1] as IMeta | undefined;
            const failed = Boolean(
                outcome && (outcome[0] instanceof Error || meta?.mtid === 'error'),
            );
            const failure = !failed
                ? null
                : outcome?.[0] instanceof Error
                  ? (outcome[0] as Error)
                  : new Error(meta?.errorMessage ?? 'Kafka feed handler failed');
            await settle(message, failure);
            if (sinceCommit >= commit.every) await flush();
        } catch (error) {
            signal?.frameworkKafkaFeedCommitFailed?.({
                feed: options.alias,
                error: messageOf(error),
            });
        } finally {
            pump();
        }
    };

    /**
     * The message an answer becomes, or nothing when the handler answered nothing (`@@D-1036`).
     *
     * A stream instance hands over the codec's own message; anything else is the packet the loop
     * writes when the port has no `encode` — `[value, $meta]` — and the feed encodes it with the
     * instance's codec, exactly as the loop would have.
     */
    const encodeAnswer = async (
        chunk: unknown,
    ): Promise<{topic: string; value: Buffer; key?: Buffer | null} | null> => {
        const message = (chunk ?? {}) as {topic?: unknown; value?: Buffer; key?: Buffer | null};
        if (typeof message.topic === 'string' && message.topic) {
            return {
                topic: message.topic,
                value: message.value ?? Buffer.alloc(0),
                key: message.key ?? null,
            };
        }
        const [value, meta] = Array.isArray(chunk) ? (chunk as unknown[]) : [chunk, undefined];
        if (value === undefined || value === null || !options.encode) return null;
        const answer = (await options.encode(value, (meta ?? {}) as IMeta)) as
            | {topic?: unknown; value?: Buffer; key?: Buffer | null}
            | undefined;
        const topic = typeof answer?.topic === 'string' ? answer.topic : '';
        if (!topic) return null;
        return {
            topic,
            value: answer?.value ?? Buffer.from(String(value)),
            key: answer?.key ?? null,
        };
    };

    // The read side: the loop takes `data` events off this and dispatches each one. Only the pump
    // pushes, so `concurrency` above is the number of records the loop holds.
    const stream = new Duplex({
        objectMode: true,
        read() {
            pump();
        },
        write: (chunk, _encoding, done) => {
            void encodeAnswer(chunk)
                .then(async answer => {
                    if (!answer) {
                        // A background handler answers nothing, and the loop hands the empty answer
                        // on anyway: there is nothing to produce, and erroring here would tear down
                        // the stream the next record is read through (`@@D-1036`).
                        done();
                        return;
                    }
                    // The codec names the logical topic; the producer map is resolved by it, and
                    // the broker is handed the physical name (`@@D-1003`).
                    await options.produce(answer.topic, {
                        value: answer.value.toString(),
                        key: answer.key == null ? null : answer.key.toString(),
                    });
                    done();
                })
                .catch(error => done(error as Error));
        },
    });

    consumer.on('data', message => {
        queue.push(message);
        pump();
    });
    consumer.on('event.error', error => {
        signal?.frameworkKafkaTopicFailed?.({
            topic: options.alias,
            error: error?.message ?? 'kafka feed consumer error',
        });
    });

    const topics = await expandTopics(config, clients, connection, spec.topics ?? []);
    if (!topics.length) throw new Error(`Kafka feed "${options.alias}" names no topic to read`);
    await whenReady(consumer);
    consumer.subscribe(topics);
    // The loop is installed before anything is polled, so no record lands where nobody reads it.
    options.connect(stream, afterDispatch, options.decode);
    consumer.consume();
    flushTimer = setInterval(() => {
        void flush();
    }, commit.ms);
    flushTimer.unref?.();
    signal?.frameworkKafkaFeedStarted?.({
        feed: options.alias,
        groupId,
        topics: topics.map(logicalOf),
        concurrency,
    });

    return {
        alias: options.alias,
        groupId,
        topics: topics.map(logicalOf),
        stats: () => ({...stats}),
        async stop() {
            if (stopped) return;
            stopped = true;
            if (flushTimer) clearInterval(flushTimer);
            flushTimer = null;
            // The work already done is told to the broker before the client goes: a graceful stop
            // loses nothing, which is what makes a restart cheap.
            await flush(STOP_COMMIT_MS);
            await new Promise<void>(resolve => {
                // A close that never answers is the same hazard as a commit that never does: the
                // consumer is gone either way, and the process has to be able to exit.
                const timer = setTimeout(() => {
                    signal?.frameworkKafkaFeedCommitFailed?.({
                        feed: options.alias,
                        error: `the consumer did not close in ${DISCONNECT_MS}ms`,
                    });
                    resolve();
                }, DISCONNECT_MS);
                timer.unref?.();
                try {
                    consumer.disconnect(() => {
                        clearTimeout(timer);
                        resolve();
                    });
                } catch {
                    clearTimeout(timer);
                    resolve();
                }
            });
            stream.destroy();
            signal?.frameworkKafkaFeedStopped?.({
                feed: options.alias,
                processed: stats.processed,
                deadLettered: stats.deadLettered,
                committed: stats.committed,
            });
        },
    };
}
