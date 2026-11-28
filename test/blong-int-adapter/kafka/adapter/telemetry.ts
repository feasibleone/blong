import {adapter} from '@feasibleone/blong';

/**
 * `telemetry` — the Kafka instance the time-series operations are reached through.
 *
 * `broker` (beside this file) is a **stream** instance: its triples are encoded, produced and read
 * back, which is what a message round-trip is. The offset, create, watch and send-with-report
 * operations are the `admin` half of the same adapter — they run in `exec` and answer values — so
 * they need an instance that is not routing every triple through the stream. One topic namespace
 * (`blong-int-adapter.telemetry.*`) and a producer kept for the whole instance is what a feed
 * needs anyway.
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
    mode?: 'stream' | 'admin';
    topicPrefix?: string;
}>(() => ({
    extends: 'adapter.kafka',
    activation: {
        default: {
            connection: {
                'client.id': 'blong-telemetry',
                'metadata.broker.list': 'localhost:9092',
                'security.protocol': 'plaintext',
            },
            // The adapter starts a read stream with these even in admin mode, and `topic.list`
            // reads broker metadata through it. The group is its own, so it takes no partition
            // from the round-trip instance's group.
            consume: {
                topics: ['blong-int-adapter'],
                groupId: 'blong-int-adapter.telemetry',
            },
            mode: 'admin',
            namespace: 'telemetry',
            // Every topic this suite uses starts with `blong-int-adapter`, and the guard is a
            // prefix of prefix + namespace — so the perf topic it creates
            // (`blong-int-adapter.telemetry.perf`) is inside the namespace this instance owns,
            // rather than the coincidence of a name that happens to match (`@@D-990`).
            topicPrefix: 'blong-int-adapter',
        },
    },
}));
