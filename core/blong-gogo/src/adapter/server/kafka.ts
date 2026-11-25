import {adapter, type IMeta, type VocabularyProxy} from '@feasibleone/blong/types';
import Kafka, {type Message} from 'node-rdkafka';
import {Duplex} from 'stream';

type KafkaConfig = ConstructorParameters<typeof Kafka.KafkaConsumer>[0];
type KafkaTopicConfig = ConstructorParameters<typeof Kafka.KafkaConsumer>[1];
type KafkaProducerConfig = ConstructorParameters<typeof Kafka.Producer>[0];

type CodecInstance = {
    encode: (...args: unknown[]) => Promise<string | Buffer<ArrayBufferLike>>;
    decode: (...args: unknown[]) => Promise<object[]>;
};

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

/*
 * The clients, as this adapter drives them (`@@T-782`).
 *
 * `node-rdkafka` is the only implementation there is in production; these shapes exist so the
 * offset arithmetic, the assign call and the delivery report can be pinned by a unit test with no
 * broker behind it. Each is the subset the adapter calls — nothing is described that the adapter
 * does not use, so a stand-in stays small.
 */

export interface IKafkaConsumer {
    connect(): unknown;
    /**
     * Close the client.
     *
     * A callback makes the close asynchronous: `node-rdkafka` without one blocks the calling thread
     * until the socket is gone, which measured **1500 ms** for a watching consumer and stalled every
     * send in the same process while it happened (`F-834`). A caller that must wait passes a callback
     * and awaits it; a caller that only needs the client gone passes a no-op.
     */
    disconnect(cb?: (error?: unknown) => void): unknown;
    isConnected(): boolean;
    on(event: 'ready', listener: () => void): unknown;
    on(event: 'data', listener: (message: Message) => void): unknown;
    on(event: 'event.error', listener: (error: {message?: string}) => void): unknown;
    setDefaultConsumeTimeout(timeoutMs: number): unknown;
    consume(
        count: number,
        cb: (error: {message?: string} | null, messages: Message[]) => void,
    ): unknown;
    /** The background loop: every record arrives as a `data` event once this is called. */
    consume(): unknown;
    subscribe(topics: string[]): unknown;
    /** The partitions to read directly — a watching reader never joins a group (`@@D-989`). */
    assign(assignments: {topic: string; partition: number; offset: number}[]): unknown;
    unassign(): unknown;
    /** What the client owns now — `offset` is absent until a fetch has landed. */
    assignments(): {topic: string; partition: number; offset?: number}[];
    getMetadata(
        options: {timeout?: number; allTopics?: boolean},
        cb: (
            error: {message?: string} | null,
            data?: {topics?: {name: string; partitions?: {id: number}[]}[]},
        ) => void,
    ): unknown;
    queryWatermarkOffsets(
        topic: string,
        partition: number,
        timeout: number,
        cb: (
            error: {message?: string} | null,
            offsets?: {lowOffset: number; highOffset: number},
        ) => void,
    ): unknown;
}

export interface IKafkaProducer {
    connect(): unknown;
    disconnect(): unknown;
    isConnected(): boolean;
    on(event: 'ready', listener: () => void): unknown;
    on(event: 'delivery-report', listener: DeliveryListener): unknown;
    off(event: 'delivery-report', listener: DeliveryListener): unknown;
    produce(
        topic: string,
        partition: number | null,
        value: Buffer,
        key?: string | null,
        timestamp?: number,
        opaque?: unknown,
    ): unknown;
    flush(timeout: number, cb?: (error: {message?: string} | null) => void): unknown;
    /** How often the client polls for events — no poll, no delivery report. */
    setPollInterval(intervalMs: number): unknown;
}

/** Where librdkafka says a produce landed, or what refused it. */
export interface IDeliveryReport {
    topic: string;
    partition: number;
    offset: number;
    opaque?: unknown;
}

type DeliveryListener = (error: {message?: string} | null, report?: IDeliveryReport) => void;

export interface IKafkaAdmin {
    createTopic(
        topic: {
            topic: string;
            num_partitions: number;
            replication_factor: number;
            config?: Record<string, string>;
        },
        cb: (error: {message?: string} | null) => void,
    ): unknown;
    disconnect(): unknown;
}

export interface IKafkaClients {
    consumer(connection: KafkaConfig, topicConfig: KafkaTopicConfig): IKafkaConsumer;
    producer(connection: KafkaProducerConfig): IKafkaProducer;
    admin(connection: KafkaConfig): IKafkaAdmin;
}

/** What `node-rdkafka` answers, which is every deployment except a unit test (`@@T-782`). */
export const nodeRdkafkaClients: IKafkaClients = {
    consumer: (connection, topicConfig) => new Kafka.KafkaConsumer(connection, topicConfig),
    producer: connection => new Kafka.Producer(connection),
    admin: connection => Kafka.AdminClient.create(connection),
};

export interface IConfig {
    connection: KafkaConfig;
    consume: {
        topics: string[];
        groupId: string;
    };
    codec?: {
        new (config: object): CodecInstance;
    };
    /**
     * Operation mode.
     * - `'stream'` (default): a produce/consume message adapter — every triple
     *   is routed through the Kafka stream (the request is encoded and produced
     *   to `consume.topics`, the response is consumed + decoded). This is the
     *   original design for message round-trips.
     * - `'admin'`: an introspection adapter — triples are routed to `exec`
     *   (like the API adapters: `super.connect()` → `handle()` → `exec`), so
     *   `{ns}.topic.*` (metadata, offsets, create, watch) and
     *   `{ns}.message.send` are reachable. No produce/consume stream.
     */
    mode?: 'stream' | 'admin';
    /**
     * The first segment of every topic this instance may touch (`@@D-990`). Defaults to `blong`,
     * which makes a topic `blong.<namespace>.<feed>`.
     */
    topicPrefix?: string;
    /**
     * The namespace a topic carries, when it is not the one this instance answers calls under.
     *
     * A realm's instance is reached as `kafka.topic.watch` — the port serves the name its file has —
     * while the feed it publishes belongs to the realm: `topicNamespace: agent` is what makes its
     * topics `blong.agent.*` and keeps every other realm's names out of reach (`@@D-990`).
     */
    topicNamespace?: string;
    /**
     * Admit a topic that carries no realm namespace.
     *
     * The escape for a broker and a topic that belong to no realm — the integration package's
     * `blong-integration`, the commander's explorer (`@@T-785`).
     */
    allowForeignTopic?: boolean;
    /**
     * Where the clients come from (`@@T-782`).
     *
     * Absent in every deployment, which means `node-rdkafka`. A unit test supplies stand-ins so the
     * offset arithmetic and the delivery report are asserted without a cluster.
     */
    clientFactory?: IKafkaClients;
}

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
async function readTopicMessages(
    clients: IKafkaClients,
    connection: KafkaConfig,
    topic: string,
    limit: number,
    signal?: VocabularyProxy,
): Promise<Message[]> {
    const consumer = clients.consumer(
        {...connection, 'group.id': `blong-commander-${Date.now()}`},
        {'auto.offset.reset': 'earliest'},
    );
    // Long enough for a join on a loaded broker, short enough that an explorer's click
    // is not left waiting for a topic that has nothing to say.
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

const messageOf = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

const pause = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

let consumerSeq = 0;

/**
 * A consumer id no other one holds.
 *
 * `node-rdkafka` refuses a consumer config without `group.id` — `connect()` then never answers
 * `ready`, which is a 20-second silence rather than an error. The id is required even for a reader
 * that assigns its partitions and never subscribes: nothing joins a group, so nothing coordinates
 * with it (`@@D-989`).
 */
const freshGroup = (kind: string): string =>
    `blong-${kind}-${Date.now().toString(36)}-${++consumerSeq}`;

/**
 * The topic namespace this instance owns (`@@D-990`).
 *
 * Derived from the namespace the adapter is attached as, not from the topic it is handed: a realm
 * that publishes a feed can only reach its own names, and the rule is the same on both sides of a
 * produce/consume pair because both ask this function.
 */
export function topicNamespace(
    config: {topicPrefix?: string; topicNamespace?: string; namespace?: string | string[]},
    namespaceHint: string,
): string {
    const declared = config.namespace;
    const namespace =
        config.topicNamespace ||
        (Array.isArray(declared)
            ? declared[0]
            : typeof declared === 'string'
              ? declared
              : ''
        )?.split('.')[0] ||
        namespaceHint;
    return `${config.topicPrefix ?? 'blong'}.${namespace}.`;
}

/**
 * The topic a call names, or a refusal that says whose name it was (`@@T-785`).
 *
 * `namespaceHint` is the first segment of the method — `agent` for `agent.topic.watch` — which is
 * what an adapter whose config does not name a namespace is attached as anyway.
 */
export function claimTopic(
    config: {
        topicPrefix?: string;
        topicNamespace?: string;
        allowForeignTopic?: boolean;
        namespace?: string | string[];
    },
    namespaceHint: string,
    topic: unknown,
): string {
    const name = typeof topic === 'string' ? topic : '';
    if (!name) throw new Error('Missing topic param');
    if (config.allowForeignTopic) return name;
    const prefix = topicNamespace(config, namespaceHint);
    if (!name.startsWith(prefix)) {
        throw new Error(
            `Kafka topic ${name} is outside the namespace ${prefix}* this adapter owns (set allowForeignTopic to admit it)`,
        );
    }
    return name;
}

/** Wait for a client's `ready`, which is where `node-rdkafka` says the broker answered. */
async function whenReady(
    client: {
        connect(): unknown;
        isConnected(): boolean;
        on(event: 'ready', listener: () => void): unknown;
    },
    timeoutMs = 20_000,
): Promise<void> {
    if (client.isConnected()) return;
    await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('Kafka client did not become ready')),
            timeoutMs,
        );
        client.on('ready', () => {
            clearTimeout(timer);
            resolve();
        });
        client.connect();
    });
}

const recordOf = (message: Message): IKafkaRecord => ({
    topic: message.topic,
    partition: message.partition,
    offset: message.offset,
    key: message.key == null ? undefined : message.key.toString(),
    value: message.value == null ? undefined : message.value.toString(),
    timestamp: message.timestamp,
});

function metadataOf(
    consumer: IKafkaConsumer,
    timeoutMs: number,
): Promise<{topics?: {name: string; partitions?: {id: number}[]}[]}> {
    return new Promise((resolve, reject) => {
        consumer.getMetadata({timeout: timeoutMs, allTopics: true}, (error, data) => {
            if (error) {
                reject(new Error(error.message ?? 'Kafka metadata unavailable'));
                return;
            }
            resolve(data ?? {});
        });
    });
}

/**
 * A topic's partition ids, oldest first.
 *
 * `attempts` is what a caller that has just created a topic needs: broker metadata trails the
 * create by a moment, and a single look answers "no such topic" for one that is there.
 */
async function partitionIdsOf(
    consumer: IKafkaConsumer,
    topic: string,
    options: {attempts?: number; waitMs?: number; timeoutMs?: number} = {},
): Promise<number[]> {
    const attempts = options.attempts ?? 1;
    for (let attempt = 1; ; attempt++) {
        const metadata = await metadataOf(consumer, options.timeoutMs ?? 5_000);
        const found = metadata.topics?.find(candidate => candidate.name === topic);
        if (found) {
            return (found.partitions ?? []).map(part => part.id).sort((a, b) => a - b);
        }
        if (attempt >= attempts) throw new Error(`Kafka topic ${topic} is not on this broker`);
        await pause(options.waitMs ?? 500);
    }
}

export interface IKafkaPartitionOffset {
    partition: number;
    low: number;
    high: number;
}

/**
 * The config a producer that answers with a delivery report is made with.
 *
 * `dr_cb` is what makes librdkafka report at all. `linger.ms` of zero is what makes the report
 * arrive: the default batches for 5 ms, which was 6 of the 6.7 ms a waited send took — a frame a
 * page is waiting for has nothing to gain from that batching, and a batch that wants coalescing
 * asks for it in its own config.
 */
const reportProducerConfig = (connection: KafkaProducerConfig): KafkaProducerConfig => ({
    ...connection,
    dr_cb: true,
    'linger.ms': 0,
});

/**
 * `{ns}.topic.offsets` — every partition of a topic beside its watermarks (`@@T-783`).
 *
 * A reader that wants "the last N messages" cannot ask for them: a partition interleaves every
 * session that hashes to it, so the tail is computed per partition, from `high`, and filtered by
 * key afterwards. There is deliberately no mapping from a key to a partition here — the adapter
 * configures no partitioner, so librdkafka's own decides, and the only place that fact is visible
 * is a delivery report (`@@D-996`).
 */
export async function topicOffsets(
    clients: IKafkaClients,
    connection: KafkaConfig,
    topic: string,
    options: {timeoutMs?: number; signal?: VocabularyProxy} = {},
): Promise<{topic: string; partitions: IKafkaPartitionOffset[]}> {
    const timeoutMs = options.timeoutMs ?? 5_000;
    const startedAt = Date.now();
    const consumer = clients.consumer(
        {...connection, 'group.id': freshGroup('offsets')},
        {'auto.offset.reset': 'earliest'},
    );
    try {
        await whenReady(consumer);
        const partitions = await Promise.all(
            (await partitionIdsOf(consumer, topic, {timeoutMs})).map(
                partition =>
                    new Promise<IKafkaPartitionOffset>((resolve, reject) => {
                        consumer.queryWatermarkOffsets(
                            topic,
                            partition,
                            timeoutMs,
                            (error, offsets) => {
                                if (error || !offsets) {
                                    reject(
                                        new Error(
                                            error?.message ??
                                                `Kafka holds no watermarks for ${topic}[${partition}]`,
                                        ),
                                    );
                                    return;
                                }
                                resolve({
                                    partition,
                                    low: offsets.lowOffset,
                                    high: offsets.highOffset,
                                });
                            },
                        );
                    }),
            ),
        );
        options.signal?.frameworkKafkaTopicRead?.({
            topic,
            count: partitions.length,
            elapsedMs: Date.now() - startedAt,
        });
        return {topic, partitions};
    } catch (error) {
        options.signal?.frameworkKafkaTopicFailed?.({topic, error: messageOf(error)});
        throw error;
    } finally {
        try {
            consumer.disconnect();
        } catch {
            // A consumer that never connected has nothing to leave behind.
        }
    }
}

export interface ITopicSpec {
    topic: string;
    /** The partitions the topic must have. Defaults to one, which is what auto-create gives. */
    partitions?: number;
    /** `retention.ms` — how far back a reader may go. */
    retentionMs?: number;
    /** `cleanup.policy`; `delete` unless asked otherwise. */
    cleanupPolicy?: string;
    replicationFactor?: number;
}

export interface ITopicShape {
    topic: string;
    /** True when this call made the topic; false when it was already there. */
    created: boolean;
    /** The partitions the topic has now. */
    partitions: number;
    /** False when the topic existed with another shape — a broker cannot be asked to reshape it. */
    matches: boolean;
}

const EXISTS = /exist/i;

/**
 * `{ns}.topic.create` — a topic of the shape it is asked for, once (`@@T-784`).
 *
 * Idempotent on purpose: an integration run names the same topic on every start, and the second
 * call must neither create it again nor fail. A topic that is already there with another shape is
 * reported rather than reshaped, because reshaping means deleting what the topic holds — and the
 * caller that wants that can say so by deleting it first, deliberately.
 */
export async function topicCreate(
    clients: IKafkaClients,
    connection: KafkaConfig,
    spec: ITopicSpec,
): Promise<ITopicShape> {
    const asked = spec.partitions ?? 1;
    const consumer = clients.consumer(
        {...connection, 'group.id': freshGroup('create')},
        {'auto.offset.reset': 'earliest'},
    );
    try {
        await whenReady(consumer);
        // The shape is read before anything is created: the second call of a pair answers from
        // this and never reaches the broker's admin API.
        const existing = await partitionIdsOf(consumer, spec.topic, {attempts: 1}).catch(
            () => null,
        );
        if (existing) {
            return {
                topic: spec.topic,
                created: false,
                partitions: existing.length,
                matches: existing.length === asked,
            };
        }
        let created = true;
        const admin = clients.admin(connection);
        try {
            await new Promise<void>((resolve, reject) => {
                admin.createTopic(
                    {
                        topic: spec.topic,
                        num_partitions: asked,
                        replication_factor: spec.replicationFactor ?? 1,
                        config: {
                            ...(spec.retentionMs !== undefined && {
                                'retention.ms': String(spec.retentionMs),
                            }),
                            ...(spec.cleanupPolicy && {'cleanup.policy': spec.cleanupPolicy}),
                        },
                    },
                    error => {
                        if (error) {
                            reject(new Error(error.message ?? 'Kafka topic create failed'));
                            return;
                        }
                        resolve();
                    },
                );
            });
        } catch (error) {
            // A name taken between the look and the create is the same idempotent second call, and
            // the shape below is what the answer reports.
            if (!EXISTS.test(messageOf(error))) throw error;
            created = false;
        } finally {
            try {
                admin.disconnect();
            } catch {
                // Nothing to leave behind.
            }
        }
        // Broker metadata trails the create by a moment: a single look answers "no such topic" for
        // one that was just made.
        const partitions = await partitionIdsOf(consumer, spec.topic, {
            attempts: created ? 20 : 1,
        });
        return {
            topic: spec.topic,
            created,
            partitions: partitions.length,
            matches: created || partitions.length === asked,
        };
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
    options: {topic: string; starts: IWatchStart[]; key?: string; $meta?: IMeta},
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
     * A pool of assigned consumers is the fix when a viewer's watch becomes per-page rather than
     * per-session.
     */
    let closed = false;
    const close = (): void => {
        if (closed) return;
        closed = true;
        setImmediate(() => {
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
    consumer.on('data', message => {
        if (options.key !== undefined && message.key?.toString() !== options.key) return;
        queue.push(recordOf(message));
        nudge();
    });
    consumer.on('event.error', error => {
        failure = new Error(error.message ?? 'Kafka consumer error');
        ended = true;
        nudge();
    });
    const abort = (): void => {
        ended = true;
        // The pump may be parked at a `yield` when this fires: an abort is the reader saying it
        // stopped reading, so nothing will resume the loop and its `finally` would never close the
        // consumer. The close is therefore the abort's own work, not the loop's.
        close();
        nudge();
    };
    options.$meta?.abort?.addEventListener('abort', abort, {once: true});
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

export interface IOutboundMessage {
    topic: string;
    value: string;
    key?: string | null;
    partition?: number;
}

/**
 * `{ns}.message.send` — one message, and where the broker put it (`@@T-787`).
 *
 * `dr_cb` is what makes librdkafka report at all: without it the produce is fire and forget and
 * this promise would never settle. The correlation object is the only thing tying a report to a
 * produce — several may be in flight for one producer, and the broker does not answer in order.
 */
export async function messageSend(
    clients: IKafkaClients,
    connection: KafkaProducerConfig,
    message: IOutboundMessage,
    options: {timeoutMs?: number; producer?: IKafkaProducer} = {},
): Promise<{topic: string; partition: number; offset: number}> {
    const timeoutMs = options.timeoutMs ?? 10_000;
    // A producer handed in belongs to the adapter and outlives this call; one made here belongs to
    // the call and is closed when it has answered.
    const owned = !options.producer;
    const producer = options.producer ?? clients.producer(reportProducerConfig(connection));
    const correlation = {};
    try {
        // A producer the adapter already made is connected; asking again would leave a `ready`
        // listener behind on every send.
        if (!producer.isConnected()) await whenReady(producer);
        // A delivery report is an event, and librdkafka only raises events to a client that
        // polls. The interval is the whole latency of a send that waits for its report: ten
        // milliseconds measured 87 messages a second, one measures the broker instead. Idle polls
        // cost nothing, so the timetable is set for the send that waits.
        producer.setPollInterval(1);
        const report = new Promise<{partition: number; offset: number}>((resolve, reject) => {
            const settle = (): void => {
                clearTimeout(timer);
                producer.off('delivery-report', onReport);
            };
            const timer = setTimeout(() => {
                settle();
                reject(
                    new Error(
                        `Kafka answered no delivery report for ${message.topic} in ${timeoutMs}ms`,
                    ),
                );
            }, timeoutMs);
            const onReport: DeliveryListener = (error, delivered) => {
                // A report that names no partition cannot be matched to a produce; one send per
                // correlation is in flight here, so such a report belongs to the awaited message.
                if (delivered && delivered.opaque !== correlation) return;
                settle();
                if (error) {
                    reject(new Error(error.message ?? 'Kafka delivery failed'));
                    return;
                }
                if (!delivered) {
                    reject(new Error(`Kafka reported no partition for ${message.topic}`));
                    return;
                }
                resolve({partition: delivered.partition, offset: delivered.offset});
            };
            producer.on('delivery-report', onReport);
        });
        // A produce that throws must not leave the report's rejection unobserved: the promise is
        // settled either way, and the caller is told by the throw.
        void report.catch(() => undefined);
        producer.produce(
            message.topic,
            message.partition ?? null,
            Buffer.from(message.value),
            message.key ?? null,
            undefined,
            correlation,
        );
        const landed = await report;
        return {topic: message.topic, ...landed};
    } finally {
        if (owned) {
            try {
                producer.flush(5_000);
            } catch {
                // The report has already answered the call; a busy queue changes nothing.
            }
            try {
                producer.disconnect();
            } catch {
                // A producer that never connected has nothing to leave behind.
            }
        }
    }
}

export default adapter<IConfig>(() => {
    let stream: Duplex | null = null;
    let codec: CodecInstance | null = null;
    let reportProducer: IKafkaProducer | null = null;
    let producerStream: ReturnType<typeof Kafka.Producer.createWriteStream> | null = null;
    let consumerStream:
        | (ReturnType<typeof Kafka.KafkaConsumer.createReadStream> & {
              consumer: {
                  isConnected(): boolean;
                  once(event: 'ready', cb: () => void): void;
                  assignments(): {partition: number; topic: string; offset: number}[];
                  getMetadata(
                      opts: {timeout: number},
                      cb: (
                          err: Error | null,
                          data?: {topics?: Array<{name: string; partitions: unknown[]}>},
                      ) => void,
                  ): void;
              };
          })
        | null = null;

    return {
        activation: {
            default: {
                type: 'kafka',
                connection: {
                    'client.id': 'blong',
                    'security.protocol': 'sasl_plaintext',
                    'sasl.mechanism': 'SCRAM-SHA-256',
                },
            },
        },

        async start() {
            const result = await super.start();

            const isAdmin = this.config.mode === 'admin';
            // The codec encodes/decodes the Kafka stream message format. Admin
            // (introspection) mode routes triples to `exec` (plain object
            // responses), so the codec must NOT be applied there — a stream
            // codec would try `msg.value.toString()` on the exec result.
            if (this.config.codec && !isAdmin) {
                codec = new this.config.codec({});
                this.encode = (...params) => codec!.encode(...params);
                this.decode = (...params) => codec!.decode(...params);
            } else {
                codec = null;
            }

            const groupId = this.config.consume.groupId;
            const startedAt = Date.now();
            const consumerConfig = {
                ...this.config.connection,
                'group.id': groupId,
            };
            this.signal?.frameworkKafkaConsumerCreating?.({
                groupId,
                topics: this.config.consume.topics,
                sessionTimeoutMs: consumerConfig['session.timeout.ms'],
                broker: consumerConfig['metadata.broker.list'],
            });

            if (isAdmin) {
                // An admin instance holds no group and no read stream: every operation it answers
                // makes its own client and closes it, so a realm can attach this adapter before a
                // broker exists — and a process that never reads a topic never joins one
                // (`@@D-1000`).
                super.connect();
                return result;
            }

            consumerStream = Kafka.KafkaConsumer.createReadStream(
                consumerConfig,
                {
                    'auto.offset.reset': 'earliest',
                },
                {topics: this.config.consume.topics},
            ) as typeof consumerStream;

            // Wait for consumer to connect and receive partition assignments.
            // node-rdkafka group rebalance can take up to a few seconds after 'ready'.
            await new Promise<void>((resolve, reject) => {
                let poll: ReturnType<typeof setInterval> | null = null;
                let safety: ReturnType<typeof setTimeout> | null = null;
                const cleanup = () => {
                    if (poll) clearInterval(poll);
                    if (safety) clearTimeout(safety);
                    poll = null;
                    safety = null;
                };
                const startPolling = () => {
                    poll = setInterval(() => {
                        if (consumerStream!.consumer.assignments().length > 0) {
                            cleanup();
                            this.signal?.frameworkKafkaConsumerAssigned?.({
                                groupId,
                                elapsedMs: Date.now() - startedAt,
                            });
                            resolve();
                        }
                    }, 200);
                    safety = setTimeout(() => {
                        cleanup();
                        this.signal?.frameworkKafkaAssignmentTimedOut?.({
                            groupId,
                            elapsedMs: Date.now() - startedAt,
                            hint: 'stale group members from an earlier abrupt shutdown keep the rebalance waiting up to session.timeout.ms',
                        });
                        // Best-effort graceful close BEFORE failing start: a
                        // consumer that joined the group but never got an
                        // assignment would otherwise linger as a stale group
                        // member (no LeaveGroup), blocking the NEXT rebalance
                        // for up to session.timeout.ms too. destroy() →
                        // close() → disconnect() sends LeaveGroup.
                        try {
                            consumerStream?.destroy();
                        } catch {
                            // ignore — the process is already failing start
                        }
                        reject(new Error('Kafka assignment timeout'));
                    }, 30000);
                };
                if (consumerStream!.consumer.isConnected()) {
                    this.signal?.frameworkKafkaConsumerConnected?.({groupId});
                    startPolling();
                } else {
                    this.signal?.frameworkKafkaConsumerConnecting?.({groupId});
                    consumerStream!.consumer.once('ready', () => {
                        this.signal?.frameworkKafkaConsumerReady?.({
                            groupId,
                            elapsedMs: Date.now() - startedAt,
                        });
                        startPolling();
                    });
                }
            });

            {
                producerStream = Kafka.Producer.createWriteStream(
                    {
                        ...this.config.connection,
                    },
                    {},
                    {
                        objectMode: true,
                    },
                );

                // Build a custom Duplex that writes to the Kafka producer and
                // receives messages from the Kafka consumer via 'data' events.
                // Duplex.from({readable, writable}) is not used because it does
                // not reliably forward object-mode events from the inner readable.
                stream = new Duplex({objectMode: true, read() {}});
                stream.write = (chunk, ...args) =>
                    (producerStream!.write as (...a: unknown[]) => boolean)(chunk, ...args);

                consumerStream!.on('data', msg => stream?.push(msg));
                consumerStream!.on('end', () => stream?.push(null));
                consumerStream!.on('error', err => stream?.destroy(err as Error));

                super.connect(stream);
            }

            return result;
        },

        async stop(...params: unknown[]) {
            const groupId = this.config.consume?.groupId as string | undefined;
            const stopStartedAt = Date.now();
            this.signal?.frameworkKafkaStop?.({groupId});
            const awaitClose = (
                s: {once(e: 'close', cb: () => void): void} | null,
                disconnect: () => void,
                ms: number,
            ) =>
                !s
                    ? Promise.resolve()
                    : new Promise<void>(resolve => {
                          const t = setTimeout(() => {
                              this.signal?.frameworkKafkaCloseTimedOut?.({
                                  groupId,
                                  waitMs: ms,
                                  elapsedMs: Date.now() - stopStartedAt,
                                  hint: 'consumer/producer did not emit close — the group member was not gracefully removed',
                              });
                              resolve();
                          }, ms);
                          s.once('close', () => {
                              clearTimeout(t);
                              this.signal?.frameworkKafkaClosed?.({
                                  groupId,
                                  elapsedMs: Date.now() - stopStartedAt,
                              });
                              resolve();
                          });
                          disconnect();
                      });

            let result;
            try {
                stream?.destroy();
                try {
                    reportProducer?.disconnect();
                } catch {
                    // It was never connected, or has already gone.
                }
                // consumerStream.destroy() → close() → consumer.disconnect() → emits 'close'
                // producerStream.close()   →           producer.disconnect() → emits 'close'
                // Both must complete so rdkafka uv handles are released and the process exits.
                await Promise.all([
                    awaitClose(consumerStream, () => consumerStream?.destroy(), 20000),
                    awaitClose(
                        producerStream as unknown as Parameters<typeof awaitClose>[0],
                        () => (producerStream as unknown as {close(): void} | null)?.close(),
                        20000,
                    ),
                ]);
                this.signal?.frameworkKafkaStopComplete?.({
                    groupId,
                    elapsedMs: Date.now() - stopStartedAt,
                });
            } finally {
                stream = null;
                codec = null;
                reportProducer = null;
                consumerStream = null;
                producerStream = null;
                result = await super.stop(...params);
            }
            return result;
        },

        async exec(params: Record<string, unknown>, $meta: IMeta): Promise<unknown> {
            const {method} = $meta;
            const [, object, operation] = method!.split('.');
            const config = this.config as IConfig & {namespace?: string | string[]};
            const clients = config.clientFactory ?? nodeRdkafkaClients;
            const connection = config.connection;
            const namespaceHint = String(method ?? '').split('.')[0];
            /**
             * The topic this call names, refused unless it carries this instance's namespace
             * (`@@D-990`). A second realm on the same broker cannot take a name the first holds.
             */
            const ownTopic = (name: unknown): string => claimTopic(config, namespaceHint, name);
            if (object === 'topic') {
                switch (operation) {
                    case 'list': {
                        // `{ns}.topic.list` — enumerate topics from broker metadata. The instance
                        // holds no consumer of its own, so the look makes one and closes it.
                        const consumer = clients.consumer(
                            {...connection, 'group.id': freshGroup('list')},
                            {'auto.offset.reset': 'earliest'},
                        );
                        try {
                            await whenReady(consumer);
                            const metadata = await metadataOf(consumer, 5_000);
                            return {
                                items: (metadata.topics ?? [])
                                    .filter(t => !t.name.startsWith('__'))
                                    .map(t => ({
                                        topic: t.name,
                                        partitionCount: t.partitions?.length ?? 0,
                                    })),
                            };
                        } finally {
                            try {
                                consumer.disconnect();
                            } catch {
                                // A consumer that never connected has nothing to leave behind.
                            }
                        }
                    }
                    case 'find': {
                        // `{ns}.topic.find` — read a batch of messages from a topic.
                        // A fresh consumer group with `auto.offset.reset: earliest`
                        // reads existing messages from the beginning (exploration);
                        // partitions are surfaced as message metadata, not tree nodes.
                        const topic = ownTopic(params.topic);
                        const limit = (params.limit as number) ?? 50;
                        const messages = await readTopicMessages(
                            clients,
                            connection,
                            topic,
                            limit,
                            this.signal,
                        );
                        return {
                            items: messages.map(m => ({
                                topic: m.topic,
                                partition: m.partition,
                                offset: m.offset,
                                key: m.key?.toString(),
                                value: m.value?.toString(),
                                timestamp: m.timestamp,
                            })),
                        };
                    }
                    case 'offsets':
                        // `{ns}.topic.offsets` — the partitions and their watermarks, which is
                        // what a caller turns into "start at `high - tail` on every partition".
                        return topicOffsets(clients, connection, ownTopic(params.topic), {
                            timeoutMs: params.timeoutMs as number | undefined,
                            signal: this.signal,
                        });
                    case 'create':
                        // `{ns}.topic.create` — idempotent, because an integration run names the
                        // same topic on every start and auto-create gives it one partition.
                        return topicCreate(clients, connection, {
                            topic: ownTopic(params.topic),
                            partitions: params.partitions as number | undefined,
                            retentionMs: params.retentionMs as number | undefined,
                            cleanupPolicy: params.cleanupPolicy as string | undefined,
                            replicationFactor: params.replicationFactor as number | undefined,
                        });
                    case 'watch':
                        // `{ns}.topic.watch` — an async iterable, which the gateway streams: the
                        // op is a producer of frames, not an answer (`@@D-949`).
                        return topicWatch(clients, connection, {
                            topic: ownTopic(params.topic),
                            starts: startsOf(params.starts),
                            key: params.key as string | undefined,
                            $meta,
                        });
                }
            }
            if (object === 'message' && operation === 'send') {
                // `{ns}.message.send` — one message, and the partition and offset it landed at.
                //
                // The producer is made once per adapter and kept: a producer is a connection to
                // the broker, and a telemetry batch is dozens of messages that must not each pay
                // for one. `stop()` closes it with the streams.
                reportProducer ||= clients.producer(reportProducerConfig(connection));
                return messageSend(
                    clients,
                    connection,
                    {
                        topic: ownTopic(params.topic),
                        value:
                            typeof params.value === 'string'
                                ? params.value
                                : JSON.stringify(params.value ?? null),
                        key: params.key as string | null | undefined,
                        partition: params.partition as number | undefined,
                    },
                    {producer: reportProducer, timeoutMs: params.timeoutMs as number | undefined},
                );
            }
            throw new Error(`Unknown kafka operation: ${object}.${operation}`);
        },
    };
});
