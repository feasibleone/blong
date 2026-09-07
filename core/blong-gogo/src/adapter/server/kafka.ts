import {adapter, type IMeta} from '@feasibleone/blong/types';
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
            this.log?.info?.(
                {
                    groupId,
                    topics: this.config.consume.topics,
                    sessionTimeoutMs: consumerConfig['session.timeout.ms'],
                    broker: consumerConfig['metadata.broker.list'],
                },
                'kafka consumer creating',
            );

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
                            this.log?.info?.(
                                {groupId, elapsedMs: Date.now() - startedAt},
                                'kafka consumer assigned',
                            );
                            resolve();
                        }
                    }, 200);
                    safety = setTimeout(() => {
                        cleanup();
                        this.log?.warn?.(
                            {
                                groupId,
                                elapsedMs: Date.now() - startedAt,
                                hint: 'stale group members from an earlier abrupt shutdown keep the rebalance waiting up to session.timeout.ms',
                            },
                            'kafka consumer assignment timed out',
                        );
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
                    this.log?.info?.({groupId}, 'kafka consumer already connected');
                    startPolling();
                } else {
                    this.log?.info?.({groupId}, 'kafka consumer connecting, waiting for ready');
                    consumerStream!.consumer.once('ready', () => {
                        this.log?.info?.(
                            {groupId, elapsedMs: Date.now() - startedAt},
                            'kafka consumer ready',
                        );
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
            this.log?.info?.({groupId}, 'kafka adapter stop');
            const awaitClose = (
                s: {once(e: 'close', cb: () => void): void} | null,
                disconnect: () => void,
                ms: number,
            ) =>
                !s
                    ? Promise.resolve()
                    : new Promise<void>(resolve => {
                          const t = setTimeout(() => {
                              this.log?.warn?.(
                                  {
                                      groupId,
                                      waitMs: ms,
                                      elapsedMs: Date.now() - stopStartedAt,
                                      hint: 'consumer/producer did not emit close — the group member was not gracefully removed',
                                  },
                                  'kafka close timed out',
                              );
                              resolve();
                          }, ms);
                          s.once('close', () => {
                              clearTimeout(t);
                              this.log?.info?.(
                                  {
                                      groupId,
                                      elapsedMs: Date.now() - stopStartedAt,
                                  },
                                  'kafka consumer/producer closed (LeaveGroup sent)',
                              );
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
                this.log?.info?.(
                    {groupId, elapsedMs: Date.now() - stopStartedAt},
                    'kafka adapter stop complete',
                );
            } finally {
                stream = null;
                codec = null;
                consumerStream = null;
                producerStream = null;
                result = await super.stop(...params);
            }
            return result;
        },

        async exec(
            params: Record<string, unknown>,
            $meta: IMeta,
        ): Promise<unknown> {
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
                        const consumer = new Kafka.KafkaConsumer(
                            {
                                ...this.config.connection,
                                'group.id': `blong-commander-${Date.now()}`,
                            },
                            {'auto.offset.reset': 'earliest'},
                        );
                        // A fresh group must complete the rebalance (group join +
                        // partition assignment) before the first consume returns.
                        consumer.setDefaultConsumeTimeout(3000);
                        // Always RESOLVE to a (possibly empty) batch — a rebalance
                        // stall or broker hiccup must surface as an empty topic, not
                        // as a malformed/empty RPC response ("JSON RPC response
                        // without response and error").
                        const messages = await new Promise<Message[] | undefined>(resolve => {
                            const timer = setTimeout(() => {
                                try {
                                    consumer.disconnect();
                                } catch {
                                    // ignore
                                }
                                resolve(undefined);
                            }, 15000);
                            const done = (msgs: Message[] | undefined) => {
                                clearTimeout(timer);
                                try {
                                    consumer.disconnect();
                                } catch {
                                    // ignore
                                }
                                resolve(msgs);
                            };
                            consumer.on('ready', () => {
                                consumer.subscribe([topic]);
                                consumer.consume(limit, (err, msgs) => {
                                    if (err) return done(undefined);
                                    done(msgs);
                                });
                            });
                            consumer.on('event.error', () => done(undefined));
                            consumer.connect();
                        });
                        return {
                            items: (messages ?? []).map(m => ({
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
