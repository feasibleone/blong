import {adapter} from '@feasibleone/blong';
import Kafka from 'node-rdkafka';
import {Duplex} from 'stream';

type KafkaConfig = ConstructorParameters<typeof Kafka.KafkaConsumer>[0];

export interface IConfig {
    connection: KafkaConfig;
    consume: {
        topics: string[];
        groupId: string;
    };
    codec: {
        new (config: object);
        encode: (data: object[], $meta, context, log) => string | Buffer;
        decode: (buff: string | Buffer, $meta, context, log) => object[];
    };
}

export default adapter<IConfig>(api => {
    let stream: Duplex = null;

    return {
        async init(...configs: object[]) {
            const connection: KafkaConfig = {
                'client.id': 'blong',
                'security.protocol': 'sasl_plaintext',
                'sasl.mechanism': 'SCRAM-SHA-256',
            };
            await super.init(
                {
                    connection,
                },
                ...configs
            );
        },

        async start() {
            const result = await super.start();

            stream = Duplex.from({
                writable: Kafka.Producer.createWriteStream(
                    {
                        ...this.config.connection,
                    },
                    {},
                    {
                        objectMode: true,
                    }
                ),
                readable: Kafka.KafkaConsumer.createReadStream(
                    {
                        ...this.config.connection,
                        'group.id': this.config.consume.groupId,
                    },
                    {},
                    {topics: this.config.consume.topics}
                ),
            });

            super.connect(stream);

            return result;
        },

        async stop(...params: unknown[]) {
            let result;
            try {
                stream?.destroy();
            } finally {
                stream = null;
                result = await super.stop(...params);
            }
            return result;
        },
    };
});
