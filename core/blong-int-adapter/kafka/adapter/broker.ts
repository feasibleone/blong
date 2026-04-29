import {adapter} from '@feasibleone/blong';
import {randomUUID} from 'node:crypto';

type KafkaMessage = {topic: string; partition: number; value: Buffer};

class KafkaJsonCodec {
    encode(data: Record<string, unknown>, $meta: Record<string, unknown>) {
        if (!$meta.trace) $meta.trace = randomUUID();
        const {topic = 'blong-integration', partition = 0, ...rest} = data;
        return {
            topic,
            partition,
            value: Buffer.from(JSON.stringify({...rest, _trace: $meta.trace})),
        };
    }

    decode(msg: KafkaMessage, $meta: Record<string, unknown>) {
        let parsed: Record<string, unknown> = {};
        try {
            parsed = JSON.parse(msg.value.toString()) as Record<string, unknown>;
        } catch {
            parsed = {payload: msg.value.toString()};
        }
        const {_trace, ...rest} = parsed;
        if (_trace) $meta.trace = _trace;
        $meta.mtid = 'response';
        return {sent: true, topic: msg.topic, partition: msg.partition, ...rest};
    }
}

export default adapter<{
    connection: {
        'metadata.broker.list': string;
        [key: string]: unknown;
    };
    consume: {
        topics: string[];
        groupId: string;
    };
    codec: typeof KafkaJsonCodec;
}>(() => ({
    extends: 'adapter.kafka',
    activation: {
        default: {
            connection: {
                'client.id': 'blong-test',
                'metadata.broker.list': 'localhost:9092',
                'security.protocol': 'plaintext',
            },
            consume: {
                topics: ['blong-integration'],
                groupId: 'blong-integration-group',
            },
            codec: KafkaJsonCodec,
            namespace: 'broker',
        },
    },
}));
