import {adapter} from '@feasibleone/blong/types';
import Kafka from 'node-rdkafka';
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

            if (this.config.codec) {
                codec = new this.config.codec({});
                this.encode = (...params) => codec!.encode(...params);
                this.decode = (...params) => codec!.decode(...params);
            } else {
                codec = null;
            }

            consumerStream = Kafka.KafkaConsumer.createReadStream(
                {
                    ...this.config.connection,
                    'group.id': this.config.consume.groupId,
                },
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
                            resolve();
                        }
                    }, 200);
                    safety = setTimeout(() => {
                        cleanup();
                        reject(new Error('Kafka assignment timeout'));
                    }, 30000);
                };
                if (consumerStream!.consumer.isConnected()) {
                    startPolling();
                } else {
                    consumerStream!.consumer.once('ready', startPolling);
                }
            });

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

            return result;
        },

        async stop(...params: unknown[]) {
            const awaitClose = (
                s: {once(e: 'close', cb: () => void): void} | null,
                disconnect: () => void,
                ms: number,
            ) =>
                !s
                    ? Promise.resolve()
                    : new Promise<void>(resolve => {
                          const t = setTimeout(resolve, ms);
                          s.once('close', () => {
                              clearTimeout(t);
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
            } finally {
                stream = null;
                codec = null;
                consumerStream = null;
                producerStream = null;
                result = await super.stop(...params);
            }
            return result;
        },
    };
});
