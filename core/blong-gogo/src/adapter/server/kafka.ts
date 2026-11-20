import {adapter, type IMeta, type VocabularyProxy} from '@feasibleone/blong/types';
import Kafka, {type Message} from 'node-rdkafka';
import {Duplex} from 'stream';

type KafkaConfig = ConstructorParameters<typeof Kafka.KafkaConsumer>[0];

type CodecInstance = {
    encode: (...args: unknown[]) => Promise<string | Buffer<ArrayBufferLike>>;
    decode: (...args: unknown[]) => Promise<object[]>;
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
     *   `{ns}.topic.list` (broker metadata) and `{ns}.topic.find` (message
     *   reads via one-off consumers) are reachable. No produce/consume stream.
     */
    mode?: 'stream' | 'admin';
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
    connection: KafkaConfig,
    topic: string,
    limit: number,
    signal?: VocabularyProxy,
): Promise<Message[]> {
    const consumer = new Kafka.KafkaConsumer(
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

export default adapter<IConfig>(() => {
    let stream: Duplex | null = null;
    let codec: CodecInstance | null = null;
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

            if (this.config.mode === 'admin') {
                // Admin/introspection mode — route triples to `exec`
                // (`super.connect()` → `handle()` → `findHandler(method) ||
                // imported['exec']`). The consumer stays connected for broker
                // metadata (`{ns}.topic.list` uses `getMetadata`); the
                // produce/consume Duplex is not built and no messages are
                // consumed by this adapter instance.
                super.connect();
            } else {
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
            const groupId = this.config.consume.groupId;
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
                consumerStream = null;
                producerStream = null;
                result = await super.stop(...params);
            }
            return result;
        },

        async exec(params: Record<string, unknown>, $meta: IMeta): Promise<unknown> {
            const {method} = $meta;
            const [, object, operation] = method!.split('.');
            if (object === 'topic') {
                switch (operation) {
                    case 'list': {
                        // `{ns}.topic.list` — enumerate topics from broker metadata
                        if (!consumerStream) {
                            throw new Error('Kafka consumer not connected');
                        }
                        const metadata = await new Promise<{
                            topics: Array<{name: string; partitions: unknown[]}>;
                        }>((resolve, reject) => {
                            consumerStream!.consumer.getMetadata(
                                {timeout: 5000, allTopics: true},
                                (err, data) => (err ? reject(err) : resolve(data ?? {topics: []})),
                            );
                        });
                        return {
                            items: (metadata.topics ?? [])
                                .filter(t => !t.name.startsWith('__'))
                                .map(t => ({
                                    topic: t.name,
                                    partitionCount: t.partitions?.length ?? 0,
                                })),
                        };
                    }
                    case 'find': {
                        // `{ns}.topic.find` — read a batch of messages from a topic.
                        // A fresh consumer group with `auto.offset.reset: earliest`
                        // reads existing messages from the beginning (exploration);
                        // partitions are surfaced as message metadata, not tree nodes.
                        const topic = params.topic as string;
                        const limit = (params.limit as number) ?? 50;
                        if (!topic) {
                            throw new Error('Missing topic param');
                        }
                        const messages = await readTopicMessages(
                            this.config.connection,
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
                }
            }
            throw new Error(`Unknown kafka operation: ${object}.${operation}`);
        },
    };
});
