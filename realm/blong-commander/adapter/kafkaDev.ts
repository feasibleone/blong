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

/**
 * `kafka-dev` adapter instance — Kafka explorer source for the commander dev
 * suite. Namespace `kafka-dev` so `kafka-dev.topic.list` /
 * `kafka-dev.topic.find` reach this instance (topic find reads partition
 * metadata + message list from the consumer group).
 */
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
    mode?: 'stream' | 'admin';
    /** The explorer reads the broker's own names, so its `dev` block empties this (`@@D-1003`). */
    tenant?: string;
    topics?: {create?: boolean; failOnMissing?: boolean};
}>(() => ({
    extends: 'adapter.kafka',
    activation: {
        default: {
            connection: {
                'client.id': 'blong-commander',
                'metadata.broker.list': 'localhost:9092',
                'security.protocol': 'plaintext',
                // Low session timeout so a consumer left behind by an abrupt
                // shutdown (no LeaveGroup) expires fast and does not block the
                // next start's rebalance (default is 45s > the adapter's 30s
                // assignment wait, which would surface as "Kafka assignment
                // timeout"). Heartbeat stays well below the session timeout.
                'session.timeout.ms': 6000,
                'heartbeat.interval.ms': 2000,
            },
            consume: {
                topics: ['blong-integration'],
                groupId: 'blong-commander-group',
            },
            codec: KafkaJsonCodec,
            // Admin/introspection mode: route `kafka-dev.topic.list` /
            // `kafka-dev.topic.find` to the adapter `exec` (broker metadata +
            // one-off message reads) instead of the produce/consume stream.
            mode: 'admin',
            namespace: 'kafka-dev',
            // The explorer reads whatever the broker holds, and those topics belong to no
            // namespace of this realm, so the namespace guard would refuse every one of them.
            allowForeignTopic: true,
            // The demo topic the explorer opens is declared in `meta/kafka/integration.yaml`
            // (`@@D-1001`). Best effort: a machine without a broker still runs the realm's other
            // groups, and the shot that needs Kafka says so on its own.
            topics: {create: true, failOnMissing: false},
        },
        // The explorer opens the topic it was shown, so it addresses the broker's own names: in
        // `dev` the base adapter would otherwise put this developer's tenant in front of one that
        // already carries somebody's (`@@D-1003`).
        dev: {tenant: ''},
    },
}));
