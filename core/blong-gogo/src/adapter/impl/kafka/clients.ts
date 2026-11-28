/**
 * The Kafka clients this adapter drives, and the waits that make them usable.
 *
 * `node-rdkafka` is the only implementation there is in production; these shapes exist so the
 * offset arithmetic, the assign call and the delivery report can be pinned by a unit test with no
 * broker behind it (`@@T-782`). Each is the subset the adapter calls — nothing is described that
 * the adapter does not use, so a stand-in stays small.
 */
import Kafka, {type Message} from 'node-rdkafka';

export type KafkaConfig = ConstructorParameters<typeof Kafka.KafkaConsumer>[0];
export type KafkaTopicConfig = ConstructorParameters<typeof Kafka.KafkaConsumer>[1];
export type KafkaProducerConfig = ConstructorParameters<typeof Kafka.Producer>[0];

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
    off(event: 'data', listener: (message: Message) => void): unknown;
    on(event: 'event.error', listener: (error: {message?: string}) => void): unknown;
    setDefaultConsumeTimeout(timeoutMs: number): unknown;
    consume(count: number, cb: (error: {message?: string} | null, messages: Message[]) => unknown): unknown;
    /** The background loop: every record arrives as a `data` event once this is called. */
    consume(): unknown;
    subscribe(topics: string[]): unknown;
    /** The partitions to read directly — a watching reader never joins a group (`@@D-989`). */
    assign(assignments: {topic: string; partition: number; offset: number}[]): unknown;
    unassign(): unknown;
    /** What the client owns now — `offset` is absent until a fetch has landed. */
    assignments(): {topic: string; partition: number; offset?: number}[];
    /**
     * Commit offsets explicitly, which is what a feed does and a reading consumer never does.
     *
     * The offset is the one the group resumes from — the record's own offset plus one — because an
     * offset named here is the first one *not* yet processed. `enable.auto.commit` stays off: a
     * committed record is a processed one, never a delivered one (`@@D-1036`).
     */
    commit(
        offsets: {topic: string; partition: number; offset: number}[],
        cb?: (error: {message?: string} | null) => unknown,
    ): unknown;
    getMetadata(
        options: {timeout?: number; allTopics?: boolean},
        cb: (
            error: {message?: string} | null,
            data?: {topics?: {name: string; partitions?: {id: number}[]}[]},
        ) => unknown,
    ): unknown;
    queryWatermarkOffsets(
        topic: string,
        partition: number,
        timeout: number,
        cb: (error: {message?: string} | null, offsets?: {lowOffset: number; highOffset: number}) => unknown,
    ): unknown;
}

export interface IKafkaProducer {
    connect(): unknown;
    disconnect(): unknown;
    isConnected(): boolean;
    on(event: 'ready', listener: () => void): unknown;
    on(event: 'delivery-report', listener: DeliveryListener): unknown;
    off(event: 'delivery-report', listener: DeliveryListener): unknown;
    /**
     * How a producer reports an address it cannot reach or a broker that refused it, which is the
     * event `whenReady` waits beside `ready` (`@@D-1001`).
     */
    on(event: 'event.error', listener: (error: {message?: string}) => void): unknown;
    produce(
        topic: string,
        partition: number | null,
        value: Buffer,
        key?: string | null,
        timestamp?: number,
        opaque?: unknown,
        headers?: IKafkaHeader[],
    ): unknown;
    flush(timeout: number, cb?: (error: {message?: string} | null) => unknown): unknown;
    /** How often the client polls for events — no poll, no delivery report. */
    setPollInterval(intervalMs: number): unknown;
}

/** One header of a record, as `node-rdkafka` carries it beside the value. */
export interface IKafkaHeader {
    name: string;
    value: Buffer;
}

/** Where librdkafka says a produce landed, or what refused it. */
export interface IDeliveryReport {
    topic: string;
    partition: number;
    offset: number;
    opaque?: unknown;
}

export type DeliveryListener = (
    error: {message?: string} | null,
    report?: IDeliveryReport,
) => void;

export interface IKafkaAdmin {
    createTopic(
        topic: {
            topic: string;
            num_partitions: number;
            replication_factor: number;
            config?: Record<string, string>;
        },
        cb: (error: {message?: string} | null) => unknown,
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
    producer: connection => new Kafka.Producer(connection) as unknown as IKafkaProducer,
    admin: connection => Kafka.AdminClient.create(connection),
};

export const messageOf = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

export const pause = (ms: number): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, ms));

let consumerSeq = 0;

/**
 * A consumer id no other one holds.
 *
 * `node-rdkafka` refuses a consumer config without `group.id` — `connect()` then never answers
 * `ready`, which is a 20-second silence rather than an error. The id is required even for a reader
 * that assigns its partitions and never subscribes: nothing joins a group, so nothing coordinates
 * with it (`@@D-989`).
 */
export const freshGroup = (kind: string): string =>
    `blong-${kind}-${Date.now().toString(36)}-${++consumerSeq}`;

/**
 * Wait for a client's `ready`, which is where `node-rdkafka` says the broker answered.
 *
 * An address that refused the connection is reported as an `event.error` rather than as a failed
 * `connect()`, so a client that only listened for `ready` sat out the whole timeout over a socket
 * that had answered at once — the difference between a start that says "no broker at localhost:9092"
 * and one that says nothing for twenty seconds.
 */
export async function whenReady(
    client: {
        connect(): unknown;
        isConnected(): boolean;
        on(event: 'ready', listener: () => void): unknown;
        on(event: 'event.error', listener: (error: {message?: string}) => void): unknown;
    },
    timeoutMs = 20_000,
): Promise<void> {
    if (client.isConnected()) return;
    await new Promise<void>((resolve, reject) => {
        // Whichever of the three arrives first answers the promise; the listeners stay attached,
        // which costs nothing — `ready` and a connect-time `event.error` are both once in a client's
        // life, and a later one finds the promise already settled.
        let settled = false;
        const finish = (error?: Error): void => {
            if (settled) return;
            settled = true;
            if (error) reject(error);
            else resolve();
        };
        client.on('ready', () => finish());
        client.on('event.error', error =>
            finish(new Error(error?.message ?? 'Kafka client failed to connect')),
        );
        // `unref` rather than a variable to clear: a wait that settled must not hold the process
        // open for the rest of the budget, and a timer that fires into a settled promise does
        // nothing.
        setTimeout(() => finish(new Error('Kafka client did not become ready')), timeoutMs).unref();
        client.connect();
    });
}

/** The broker's view of every topic it holds, which is what a name cannot tell on its own. */
export function metadataOf(
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
export async function partitionIdsOf(
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

export type {Message};
