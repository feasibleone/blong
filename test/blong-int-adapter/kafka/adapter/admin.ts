/**
 * `admin` — the Kafka instance the client maps and the feed are exercised through.
 *
 * It answers as `kafka` — the plain namespace, so a handler reads `kafka.topic.resolve` rather than
 * carrying a word of its own — and it is an `admin` instance on purpose: its operations run in
 * `exec` and answer values, so a test can ask `kafka.topic.resolve` what a topic resolved to, and
 * `mode: 'admin'` also proves that a feed lives beside an instance that serves no stream
 * (`@@D-1035` `@@D-1036`).
 */
import {adapter} from '@feasibleone/blong';

/** The topic the feed reads, and the one a record it cannot handle ends up in. */
export const WORK_TOPIC = 'blong-int-adapter.feed.work';
export const DEAD_TOPIC = 'blong-int-adapter.feed.dead';
/** The topic the feed with a concurrency of three reads (`@@D-1036`). */
export const PARALLEL_TOPIC = 'blong-int-adapter.feed.parallel';
/** The pattern a feed subscribes through, and the two topics it stands for (`@@D-1035`). */
export const GLOB_PATTERN = 'blong-int-adapter.feed.glob.*';
export const GLOB_TOPICS = [
    'blong-int-adapter.feed.glob.one',
    'blong-int-adapter.feed.glob.two',
] as const;

type FeedRecord = {method?: string; params?: Record<string, unknown>};

/**
 * The codec a feed decodes with (`@@D-1036`).
 *
 * A record is a call: its value says which method it is and what to pass, and the decode is what
 * fills `$meta.method` — the same two facts a stream codec would fill from a request body.
 */
class FeedCodec {
    encode(data: Record<string, unknown>) {
        return {
            topic: (data.topic as string) ?? 'blong-int-adapter.feed.answers',
            partition: null,
            value: Buffer.from(JSON.stringify(data)),
        };
    }

    decode(message: {value?: Buffer}, $meta: Record<string, unknown>) {
        const parsed = JSON.parse(message.value?.toString() ?? '{}') as FeedRecord;
        $meta.method = parsed.method ?? 'kafka.feed.record.handle';
        $meta.mtid = 'request';
        return parsed.params ?? {};
    }
}

export default adapter<{
    connection: {
        'metadata.broker.list': string;
        [key: string]: unknown;
    };
    codec: typeof FeedCodec;
    mode?: 'stream' | 'admin';
    topicPrefix?: string;
    topics?: {create?: boolean; failOnMissing?: boolean};
    producer?: Record<
        string,
        {topics?: string[]; config?: Record<string, string | number | boolean>}
    >;
    consumer?: Record<
        string,
        {
            topics?: string[];
            groupId?: string;
            assign?: boolean;
            config?: Record<string, string | number | boolean>;
        }
    >;
    feed?: Record<
        string,
        {
            topics?: string[];
            groupId?: string;
            concurrency?: number;
            commit?: number | {every?: number; ms?: number};
            attempts?: number;
            deadLetter?: string;
        }
    >;
}>(() => ({
    extends: 'adapter.kafka',
    activation: {
        default: {
            connection: {
                'client.id': 'blong-kafka-admin',
                'metadata.broker.list': 'localhost:9092',
                'security.protocol': 'plaintext',
            },
            // The adapter wants a group even when the instance serves no stream; this one is its
            // own, so it can never take a partition from a round-trip instance (`@@D-989`).
            consume: {
                topics: [WORK_TOPIC],
                groupId: 'blong-int-adapter.admin',
            },
            mode: 'admin',
            namespace: 'kafka',
            // The handlers a record is dispatched to: the feed decodes a record into a call, and
            // the call has to reach a port that answers it (`@@D-1036`).
            imports: [/feed$/],
            // `blong-int-adapter.*` belongs to the suite rather than to a realm, and the names are
            // what an operator reads in the viewer — so they carry no tenant and no namespace
            // prefix.
            allowForeignTopic: true,
            tenant: '',
            codec: FeedCodec,
            topics: {create: true},
            producer: {
                default: {},
                // A producer of its own for the answers a feed writes back, which is what the
                // pattern selects (`@@D-1035`).
                answers: {topics: ['blong-int-adapter.feed.answers*']},
            },
            consumer: {
                default: {
                    topics: [WORK_TOPIC],
                    groupId: 'blong-int-adapter.feed.readers',
                    assign: true,
                },
            },
            feed: {
                work: {
                    topics: [WORK_TOPIC],
                    groupId: 'blong-int-adapter.feed.work',
                    // One record at a time, and a commit after each: the shape a test can wait on.
                    concurrency: 1,
                    commit: {every: 1, ms: 100},
                    attempts: 2,
                    deadLetter: DEAD_TOPIC,
                    // A member a killed run left behind is reaped in seconds rather than the
                    // client's default, which is what makes a re-run start reading promptly.
                    config: {'session.timeout.ms': 6_000, 'heartbeat.interval.ms': 1_500},
                },
                // A feed whose subscription is a pattern rather than a list: a glob cannot be
                // subscribed to, so it is expanded against the broker's topics at start, and this
                // is the case that says so end to end (`@@D-1035`).
                glob: {
                    topics: [GLOB_PATTERN],
                    groupId: 'blong-int-adapter.feed.glob',
                    commit: {every: 1, ms: 100},
                    config: {'session.timeout.ms': 6_000, 'heartbeat.interval.ms': 1_500},
                },
                // A second feed over a topic of its own, so a concurrency of more than one is
                // observable end to end: several records are inside the handler at once.
                parallel: {
                    topics: [PARALLEL_TOPIC],
                    groupId: 'blong-int-adapter.feed.parallel',
                    concurrency: 3,
                    commit: {every: 1, ms: 100},
                    // No dead letter: nothing this feed reads is meant to fail, and a record that
                    // did would be retried rather than dropped (`@@D-1036`).
                    config: {'session.timeout.ms': 6_000, 'heartbeat.interval.ms': 1_500},
                },
            },
        },
        // A run of this realm is a run that wants Kafka, so a missing topic is a failure rather
        // than the warning the base `integration` block leaves it as (`@@D-1001`).
        integration: {topics: {create: true, failOnMissing: true}},
    },
}));
