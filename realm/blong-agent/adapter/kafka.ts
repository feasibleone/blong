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
 *
 * The topic itself is declared beside the realm's other assets, in `meta/kafka/telemetry.yaml`, and
 * the base adapter decides what a process does with it (`@@D-1001` `@@D-1003`): `dev` publishes
 * under the developer's own tenant and provisions it best-effort, so a laptop starts with or
 * without a broker; `upgrade` provisions it for the deployment, where a missing broker or topic
 * has to be an error. Those blocks are the base adapter's, so nothing here repeats them.
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
    tenant?: string;
    topics?: {create?: boolean; failOnMissing?: boolean};
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
