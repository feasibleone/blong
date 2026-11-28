import {adapter} from '@feasibleone/blong';
import {randomUUID} from 'node:crypto';

type KafkaMessage = {topic: string; partition: number; value: Buffer};

class KafkaJsonCodec {
    encode(data: Record<string, unknown>, $meta: Record<string, unknown>) {
        if (!$meta.trace) $meta.trace = randomUUID();
        const {topic = 'blong-int-adapter', partition = 0, ...rest} = data;
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
    topics?: {create?: boolean; failOnMissing?: boolean};
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
                topics: ['blong-int-adapter'],
                groupId: 'blong-int-adapter.stream',
            },
            codec: KafkaJsonCodec,
            namespace: 'broker',
            // `blong-int-adapter` belongs to the test cluster, not to a realm, so the namespace
            // guard would refuse the topic these tests read and write.
            allowForeignTopic: true,
            // The topic is declared in `meta/kafka/integration.yaml` (`@@D-1001`) and made before
            // this stream subscribes: a consumer subscribed to an absent topic is never assigned a
            // partition, which is a 30-second `start()` timeout rather than an error that names
            // the topic. A run of this realm is a run that wants Kafka, so a missing topic is a
            // failure.
            topics: {create: true},
        },
        // A run of this realm is a run that wants Kafka, so the base adapter's best-effort default
        // is the wrong shape here: a topic the broker does not have is a failure, not a warning.
        integration: {topics: {create: true, failOnMissing: true}},
    },
}));
