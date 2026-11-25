import {adapter} from '@feasibleone/blong';

/**
 * `agent/kafka` — the broker this realm publishes telemetry to (`@@D-987`, `@@D-988`).
 *
 * `mode: 'admin'` is what makes `kafka.topic.*` and `kafka.message.send` reach the adapter's `exec`
 * rather than the produce/consume stream, and an admin instance holds no group and no read stream —
 * so the realm starts whether or not a broker is answering, and a deployment that publishes nothing
 * connects to nothing (`@@D-1000`).
 *
 * `topicNamespace: 'agent'` is the whole reason this instance may name `blong.agent.telemetry`: it
 * answers calls as `kafka` — the name its file has, which is what a handler reaches — while its
 * topics carry the realm's namespace, and the guard refuses every other realm's names (`@@D-990`).
 */
export default adapter<{
    connection: {
        'metadata.broker.list': string;
        [key: string]: unknown;
    };
    consume?: {topics: string[]; groupId: string};
    mode?: 'stream' | 'admin';
    topicPrefix?: string;
    topicNamespace?: string;
}>(() => ({
    extends: 'adapter.kafka',
    activation: {
        default: {
            connection: {
                'client.id': 'blong-agent',
                // Dev and CI each run their own k3d cluster with Kafka exposed on this address; a
                // deployment overrides it in its rc file and nothing else (`@@D-988`).
                'metadata.broker.list': 'localhost:9092',
                'security.protocol': 'plaintext',
            },
            consume: {topics: ['blong.agent.telemetry'], groupId: 'blong-agent-telemetry'},
            mode: 'admin',
            namespace: 'kafka',
            topicNamespace: 'agent',
        },
    },
}));
