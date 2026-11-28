// Coverage matrix: test/blong-int-adapter/README.md#kafka-coverage — keep this file in step.
import type {Message} from 'node-rdkafka';
import {test} from 'tap';

import {
    claimTopic,
    clientConfigOf,
    consumerSpecOf,
    feedSpecOf,
    type IKafkaAdmin,
    type IKafkaClients,
    type IKafkaConsumer,
    type IKafkaProducer,
    logicalTopicOf,
    matchSpec,
    messageSend,
    openFeed,
    patternMatches,
    physicalGroupOf,
    physicalTopicOf,
    startsOf,
    topicCreate,
    topicDeclarationsOf,
    topicDescribe,
    topicNamespace,
    topicOffsets,
    topicProvision,
    topicWatch,
} from './kafka.ts';

type Listener = (...args: never[]) => void;
type Metadata = {topics?: {name: string; partitions?: {id: number}[]}[]};
type Connection = Parameters<IKafkaClients['consumer']>[0];

const connection: Connection = {'metadata.broker.list': 'localhost:9092'};
const TOPIC = 'blong.agent.telemetry';

/** A client whose `ready` is what `connect()` answers, as `node-rdkafka` behaves on a live broker. */
abstract class FakeClient {
    readonly listeners = new Map<string, Listener[]>();
    connected = false;
    disconnected = false;

    on(event: string, listener: Listener): unknown {
        const listeners = this.listeners.get(event) ?? [];
        listeners.push(listener);
        this.listeners.set(event, listeners);
        return this;
    }

    off(event: string, listener: Listener): unknown {
        const listeners = this.listeners.get(event) ?? [];
        this.listeners.set(
            event,
            listeners.filter(entry => entry !== listener),
        );
        return this;
    }

    emit(event: string, ...args: unknown[]): void {
        for (const listener of this.listeners.get(event) ?? []) {
            (listener as (...params: unknown[]) => void)(...args);
        }
    }

    connect(): unknown {
        this.connected = true;
        this.emit('ready');
        return this;
    }

    disconnect(): unknown {
        this.disconnected = true;
        return this;
    }

    isConnected(): boolean {
        return this.connected;
    }
}

class FakeConsumer extends FakeClient implements IKafkaConsumer {
    readonly assigned: {topic: string; partition: number; offset: number}[] = [];
    readonly subscriptions: string[][] = [];
    /** What this consumer has committed, in the order it was told. */
    readonly committed: {topic: string; partition: number; offset: number}[] = [];
    metadata: Metadata;
    watermarks: Record<number, {lowOffset: number; highOffset: number}>;
    consuming = false;
    eventsOn: [string, Listener][] = [];
    commitError: {message: string} | null = null;

    constructor(metadata: Metadata = {topics: []}, watermarks = {}) {
        super();
        this.metadata = metadata;
        this.watermarks = watermarks;
    }

    setDefaultConsumeTimeout(): unknown {
        return this;
    }

    consume(): unknown {
        this.consuming = true;
        return this;
    }

    subscribe(topics: string[]): unknown {
        this.subscriptions.push(topics);
        return this;
    }

    commit(
        offsets: {topic: string; partition: number; offset: number}[],
        cb?: (error: {message?: string} | null) => unknown,
    ): unknown {
        if (this.commitError) {
            cb?.(this.commitError);
            return this;
        }
        this.committed.push(...offsets);
        cb?.(null);
        return this;
    }

    disconnect(cb?: (error?: unknown) => void): unknown {
        this.disconnected = true;
        cb?.();
        return this;
    }

    assign(assignments: {topic: string; partition: number; offset: number}[]): unknown {
        this.assigned.push(...assignments);
        return this;
    }

    unassign(): unknown {
        return this;
    }

    assignments(): {topic: string; partition: number; offset?: number}[] {
        return this.assigned;
    }

    getMetadata(
        _options: {timeout?: number; allTopics?: boolean},
        cb: (error: {message?: string} | null, data?: Metadata) => void,
    ): unknown {
        cb(null, this.metadata);
        return this;
    }

    queryWatermarkOffsets(
        _topic: string,
        partition: number,
        _timeout: number,
        cb: (
            error: {message?: string} | null,
            offsets?: {lowOffset: number; highOffset: number},
        ) => void,
    ): unknown {
        const offsets = this.watermarks[partition];
        if (!offsets) {
            cb({message: `no partition ${partition}`});
            return this;
        }
        cb(null, offsets);
        return this;
    }

    /** One record the broker delivers while the watch is reading. */
    deliver(message: Partial<Message>): void {
        this.emit('data', {
            topic: TOPIC,
            partition: 0,
            offset: 0,
            size: 0,
            ...message,
        });
    }
}

class FakeProducer extends FakeClient implements IKafkaProducer {
    readonly produced: {
        topic: string;
        partition: number | null;
        value: Buffer;
        key?: string | null;
        opaque?: unknown;
        headers?: {name: string; value: Buffer}[];
    }[] = [];
    report: {partition: number; offset: number} | null = {partition: 0, offset: 0};
    reportError: {message: string} | null = null;

    produce(
        topic: string,
        partition: number | null,
        value: Buffer,
        key?: string | null,
        _timestamp?: number,
        opaque?: unknown,
        headers?: {name: string; value: Buffer}[],
    ): unknown {
        this.produced.push({topic, partition, value, key, opaque, headers});
        const report = this.report;
        const error = this.reportError;
        queueMicrotask(() =>
            this.emit('delivery-report', error, report && {...report, topic, opaque}),
        );
        return true;
    }

    flush(): unknown {
        return this;
    }

    setPollInterval(): unknown {
        return this;
    }
}

/**
 * A producer whose reports are emitted by the test, in whatever order it likes.
 *
 * The broker does not answer in the order it was asked, so a send that waited for "the next
 * delivery report" would take another send's partition. What ties a report to a produce is the
 * correlation object the adapter puts in `opaque`, and this producer is how that is pinned.
 */
class OrderedProducer extends FakeProducer {
    readonly pending: {opaque: unknown; topic: string}[] = [];

    produce(
        topic: string,
        _partition: number | null,
        _value: Buffer,
        _key?: string | null,
        _timestamp?: number,
        opaque?: unknown,
    ): unknown {
        this.pending.push({opaque, topic});
        return true;
    }

    /** Answer one pending produce, optionally with a correlation nobody asked for. */
    answer(index: number, offset: number, opaque?: unknown): void {
        const entry = this.pending[index];
        this.emit('delivery-report', null, {
            topic: entry.topic,
            partition: 0,
            offset,
            opaque: opaque ?? entry.opaque,
        });
    }

    /** Answer the produce for a topic, wherever it landed in the queue. */
    answerOf(topic: string, offset: number, opaque?: unknown): void {
        this.answer(
            this.pending.findIndex(entry => entry.topic === topic),
            offset,
            opaque,
        );
    }
}

class FakeAdmin implements IKafkaAdmin {
    readonly created: {
        topic: string;
        num_partitions: number;
        replication_factor: number;
        config?: Record<string, string>;
    }[] = [];
    error: {message: string} | null = null;
    /** What the broker does to metadata when the topic is made. */
    onCreated: ((spec: {topic: string; num_partitions: number}) => void) | null = null;

    createTopic(
        topic: {
            topic: string;
            num_partitions: number;
            replication_factor: number;
            config?: Record<string, string>;
        },
        cb: (error: {message?: string} | null) => void,
    ): unknown {
        if (this.error) {
            cb(this.error);
            return this;
        }
        this.created.push(topic);
        this.onCreated?.(topic);
        cb(null);
        return this;
    }

    disconnect(): unknown {
        return this;
    }
}

function clientsOf(options: {
    consumer?: IKafkaConsumer;
    producer?: IKafkaProducer;
    admin?: IKafkaAdmin;
}): IKafkaClients {
    return {
        consumer: () => options.consumer as IKafkaConsumer,
        producer: () => options.producer as IKafkaProducer,
        admin: () => options.admin as IKafkaAdmin,
    };
}

const tick = (ms = 5): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * The names a declaration resolves to, as an instance of the agent namespace answers: the key is the
 * logical name, and a `physical` name the declaration writes is used as it stands (`@@D-1003`).
 */
const resolveOf =
    (config: Parameters<typeof claimTopic>[0] = {namespace: 'agent'}, hint = 'agent') =>
    (declaration: {topic: string; physical?: string}): {logical: string; physical: string} => {
        const logical = claimTopic(config, hint, declaration.topic);
        return {
            logical,
            physical: declaration.physical ?? physicalTopicOf(config, logical),
        };
    };

test('topic.offsets reports every partition beside its watermarks', async t => {
    const consumer = new FakeConsumer(
        {topics: [{name: TOPIC, partitions: [{id: 2}, {id: 0}, {id: 1}]}]},
        {
            0: {lowOffset: 0, highOffset: 90},
            1: {lowOffset: 5, highOffset: 12},
            2: {lowOffset: 0, highOffset: 3},
        },
    );
    const answer = await topicOffsets(clientsOf({consumer}), connection, TOPIC);
    t.same(
        answer.partitions,
        [
            {partition: 0, low: 0, high: 90},
            {partition: 1, low: 5, high: 12},
            {partition: 2, low: 0, high: 3},
        ],
        'oldest partition first, its watermarks beside it',
    );
    t.same(
        Object.keys(answer.partitions[0]).sort(),
        ['high', 'low', 'partition'],
        'and nothing about a key: a partition comes from a delivery report, never a hash',
    );
    t.ok(consumer.disconnected, 'the consumer it read with is gone');
});

test('topic.create asks for the shape and creates once', async t => {
    const admin = new FakeAdmin();
    const consumer = new FakeConsumer();
    admin.onCreated = spec => {
        consumer.metadata = {
            topics: [
                {
                    name: spec.topic,
                    partitions: Array.from({length: spec.num_partitions}, (_, id) => ({id})),
                },
            ],
        };
    };
    const clients = clientsOf({consumer, admin});
    const first = await topicCreate(clients, connection, {
        topic: `${TOPIC}.test.run`,
        partitions: 12,
        config: {
            'retention.ms': 600_000,
            'retention.bytes': 104_857_600,
            'cleanup.policy': 'delete',
        },
    });
    t.equal(admin.created.length, 1, 'the broker was asked once');
    t.equal(admin.created[0].num_partitions, 12, 'for the partitions the caller needs');
    t.same(
        admin.created[0].config,
        {
            'retention.ms': '600000',
            'retention.bytes': '104857600',
            'cleanup.policy': 'delete',
        },
        'with a time and a size that end the topic’s own history',
    );
    t.same(
        {created: first.created, partitions: first.partitions, matches: first.matches},
        {created: true, partitions: 12, matches: true},
        'and the answer says what it made',
    );
    const second = await topicCreate(clients, connection, {
        topic: `${TOPIC}.test.run`,
        partitions: 12,
    });
    t.equal(second.created, false, 'the second call creates nothing');
    t.equal(second.matches, true, 'and reports the shape as asked');
    t.equal(admin.created.length, 1, 'because it never reached the admin API');
    t.end();
});

test('a topic config list is written the way the broker reads it', async t => {
    const admin = new FakeAdmin();
    const consumer = new FakeConsumer();
    admin.onCreated = spec => {
        consumer.metadata = {topics: [{name: spec.topic, partitions: [{id: 0}]}]};
    };
    await topicCreate(clientsOf({consumer, admin}), connection, {
        topic: TOPIC,
        config: {'cleanup.policy': ['delete', 'compact']},
    });
    t.same(
        admin.created[0].config,
        {'cleanup.policy': 'delete,compact'},
        'a list becomes the comma-separated form the broker takes',
    );
    t.end();
});

test('topic.create reports a topic whose shape differs instead of reshaping it', async t => {
    const consumer = new FakeConsumer({
        topics: [{name: TOPIC, partitions: [{id: 0}, {id: 1}, {id: 2}, {id: 3}]}],
    });
    const admin = new FakeAdmin();
    const shape = await topicCreate(clientsOf({consumer, admin}), connection, {
        topic: TOPIC,
        partitions: 12,
    });
    t.equal(shape.created, false, 'nothing was created');
    t.equal(shape.partitions, 4, 'the topic keeps the partitions it has');
    t.equal(shape.matches, false, 'and the caller is told it is not what was asked');
    t.equal(admin.created.length, 0, 'a reshape is a delete the caller must ask for');
    t.end();
});

test('a topic outside the adapter namespace is refused', t => {
    t.equal(
        topicNamespace({namespace: 'agent'}, 'hint'),
        'blong.agent.',
        'the prefix a realm owns',
    );
    t.equal(
        topicNamespace({namespace: ['agent.kafka', 'other'], topicPrefix: 'acme'}, 'hint'),
        'acme.agent.',
        'the first namespace segment, under the configured prefix',
    );
    t.equal(topicNamespace({}, 'commander'), 'blong.commander.', 'the method decides when unset');
    t.equal(
        topicNamespace({namespace: 'kafka', topicNamespace: 'agent'}, 'kafka'),
        'blong.agent.',
        'an instance that answers as one name can publish under the realm’s',
    );
    t.equal(claimTopic({namespace: 'agent'}, 'agent', TOPIC), TOPIC, 'its own name is admitted');
    t.throws(
        () => claimTopic({namespace: 'agent'}, 'agent', 'blong.other.thing'),
        /outside the namespace blong\.agent\./,
        'a name another realm holds is refused',
    );
    t.equal(
        claimTopic({namespace: 'agent', allowForeignTopic: true}, 'agent', 'blong.other.thing'),
        'blong.other.thing',
        'unless the instance admits a topic that belongs to no realm',
    );
    t.end();
});

test('a tenant prefixes the broker name, and the logical name stays the realm’s', t => {
    const config = {namespace: 'agent', tenant: 'Kalin'};
    t.equal(
        physicalTopicOf(config, TOPIC),
        'kalin.blong.agent.telemetry',
        'the tenant in front, reduced to the characters a topic name may carry',
    );
    t.equal(claimTopic(config, 'agent', TOPIC), TOPIC, 'a call names the logical topic');
    t.equal(
        logicalTopicOf(config, 'kalin.blong.agent.telemetry'),
        TOPIC,
        'and a name a reader was shown stands for the logical one',
    );
    t.equal(
        physicalTopicOf(config, logicalTopicOf(config, 'kalin.blong.agent.telemetry')),
        'kalin.blong.agent.telemetry',
        'so a physical name read back from the broker is not prefixed a second time',
    );
    t.equal(
        physicalTopicOf(config, `physical:${TOPIC}`),
        TOPIC,
        'physical: names the broker’s own topic, with no tenant in front of it',
    );
    t.equal(
        physicalGroupOf(config, 'blong-agent-telemetry'),
        'kalin.blong-agent-telemetry',
        'and a consumer group under the same tenant, so two tenants never share one group',
    );
    t.equal(
        physicalGroupOf(config, 'physical:blong-agent-telemetry'),
        'blong-agent-telemetry',
        'unless the group names itself, which is how one group is watched across environments',
    );
    t.equal(
        claimTopic(config, 'agent', `physical:${TOPIC}`),
        TOPIC,
        'the guard reads the name behind the marker',
    );
    t.throws(
        () => claimTopic(config, 'agent', 'physical:blong.other.thing'),
        /outside the namespace/,
        'and refuses one that belongs to another realm all the same',
    );
    t.end();
});

test('startsOf reads the offsets a watch is given', t => {
    t.same(
        startsOf([
            {partition: 0, offset: 12},
            {partition: 3, offset: '40'},
        ]),
        [
            {partition: 0, offset: 12},
            {partition: 3, offset: 40},
        ],
        'integers, in the order the caller wrote them',
    );
    t.throws(() => startsOf(undefined), /Missing starts param/, 'a watch with no start is refused');
    t.throws(
        () => startsOf([{partition: 0}]),
        /partition and offset are integers/,
        'and so is a half-specified one',
    );
    t.end();
});

test('topic.watch assigns, filters by key and stops when the reader leaves', async t => {
    const consumer = new FakeConsumer({topics: [{name: TOPIC, partitions: [{id: 0}, {id: 1}]}]});
    const controller = new AbortController();
    const seen: {partition: number; offset: number}[] = [];
    const reading = (async () => {
        for await (const record of topicWatch(clientsOf({consumer}), connection, {
            topic: TOPIC,
            starts: [
                {partition: 1, offset: 40},
                {partition: 0, offset: 7},
            ],
            key: 'session-1',
            $meta: {abort: controller.signal},
        })) {
            seen.push({partition: record.partition, offset: record.offset});
        }
    })();
    await tick();
    t.same(
        consumer.assigned,
        [
            {topic: TOPIC, partition: 1, offset: 40},
            {topic: TOPIC, partition: 0, offset: 7},
        ],
        'the offsets it was handed, per partition',
    );
    t.same(consumer.subscriptions, [], 'and no subscription: this reader joins no group');
    t.ok(consumer.consuming, 'the record loop is what turns an assignment into a read');

    consumer.deliver({partition: 1, offset: 40, key: 'session-2'});
    consumer.deliver({partition: 1, offset: 41, key: Buffer.from('session-1')});
    consumer.deliver({partition: 0, offset: 8, key: 'session-1'});
    await tick();
    t.same(
        seen,
        [
            {partition: 1, offset: 41},
            {partition: 0, offset: 8},
        ],
        'only this session’s records, in the order they arrived',
    );

    controller.abort();
    await reading;
    // The close is put on the next turn of the loop on purpose (`F-834`), so the reader's own
    // continuation runs first.
    await tick();
    t.ok(consumer.disconnected, 'the consumer is gone once the reader has left');
    t.end();
});

test('a watch is closed by the owner that registered it, not only by its reader', async t => {
    // The reader of a watch can vanish without an abort — a page closed, a generator dropped — and
    // its pump is then parked at an `await` nothing resumes, so the `finally` that closes the
    // consumer never runs. The consumer outlived the platform, and the process could not exit
    // (`F-870`). The closer registered here is what the adapter keeps until its `stop()`.
    const consumer = new FakeConsumer({topics: [{name: TOPIC, partitions: [{id: 0}]}]});
    const closers: (() => void)[] = [];
    const reading = (async () => {
        for await (const _record of topicWatch(clientsOf({consumer}), connection, {
            topic: TOPIC,
            starts: [{partition: 0, offset: 0}],
            register: close => closers.push(close),
        })) {
            // One record, and then the reader is gone without aborting: nothing pulls again.
            break;
        }
    })();
    await tick();
    t.equal(closers.length, 1, 'the watch hands its close to the owner as it starts');

    consumer.deliver({partition: 0, offset: 0, key: 'session-1'});
    await tick();

    closers[0]();
    await reading;
    await tick();
    t.ok(consumer.disconnected, 'and that close is enough to end the consumer');
    closers[0]();
    t.ok(consumer.disconnected, 'closing twice is the same close, not a second one');
    t.end();
});

test('the topics a realm declares are read from its YAML', t => {
    const [telemetry] = topicDeclarationsOf(
        {
            topics: {
                [TOPIC]: {
                    partitions: 12,
                    'retention.ms': 600_000,
                    'retention.bytes': 104_857_600,
                    'cleanup.policy': ['delete', 'compact'],
                    physical: 'blong.shared.telemetry',
                    required: true,
                },
            },
        },
        'telemetry.yaml',
    );
    t.equal(telemetry.topic, TOPIC, 'the key is the name the realm owns');
    t.equal(telemetry.partitions, 12, 'the shape it asks the broker for');
    t.same(
        telemetry.config,
        {
            'retention.ms': 600_000,
            'retention.bytes': 104_857_600,
            'cleanup.policy': ['delete', 'compact'],
        },
        'and every other key is the topic’s config, in Kafka’s own names and values',
    );
    t.equal(
        telemetry.physical,
        'blong.shared.telemetry',
        'the broker’s own name, when the declaration writes one',
    );
    t.equal(telemetry.required, true, 'marked mandatory, which a startup may refuse over');
    t.notOk(
        'seed' in telemetry,
        'a field it does not write stays out, which is what lets a later file add it',
    );

    const [seeded] = topicDeclarationsOf(
        {
            topics: {
                'blong.integration': {
                    seed: [{key: 'demo', value: '{"kind":"commander"}'}],
                },
            },
        },
        'demo.yaml',
    );
    t.same(
        seeded.seed,
        [{key: 'demo', value: '{"kind":"commander"}'}],
        'the rows a demo feed reads',
    );

    t.throws(
        () => topicDeclarationsOf({}, 'empty.yaml'),
        /expected a "topics" map/,
        'a file that declares nothing is refused with the file it came from',
    );
    t.throws(
        () => topicDeclarationsOf({topics: [TOPIC]}, 'list.yaml'),
        /expected a "topics" map/,
        'a list is not a map: a topic is reached by its name, so one file can change one topic',
    );
    t.throws(
        () => topicDeclarationsOf({topics: {[TOPIC]: {partitions: 1.5}}}, 'halves.yaml'),
        /non-negative integer/,
        'a partition count that is not a whole number never reaches the broker',
    );
    t.throws(
        () => topicDeclarationsOf({topics: {[TOPIC]: {seed: [{key: 'k'}]}}}, 'keyless.yaml'),
        /has no string "value"/,
        'and neither does a seed with no payload',
    );
    t.throws(
        () => topicDeclarationsOf({topics: {[TOPIC]: {physical: ''}}}, 'nameless-physical.yaml'),
        /"physical" is the broker's own name/,
        'a physical name that names nothing is refused',
    );
    t.throws(
        () => topicDeclarationsOf({topics: {[TOPIC]: 3}}, 'scalar.yaml'),
        /declared with its settings/,
        'nor does a topic declared as a value rather than as settings',
    );
    t.throws(
        () => topicDeclarationsOf({topics: {[TOPIC]: {'retention.msec': 600}}}, 'typo.yaml'),
        /"retention.msec" is not a Kafka topic config/,
        'a misspelt setting is refused rather than handed to a broker that would ignore it',
    );
    t.throws(
        () =>
            topicDeclarationsOf({topics: {[TOPIC]: {'retention.ms': 'a week'}}}, 'wrong-kind.yaml'),
        /"retention.ms" is a whole number/,
        'and a value of the wrong kind is refused with the topic it belongs to',
    );
    t.throws(
        () => topicDeclarationsOf({topics: {[TOPIC]: {preallocate: 'yes'}}}, 'boolean.yaml'),
        /"preallocate" is true or false/,
        'a boolean setting takes a boolean',
    );
    t.end();
});

test('topic.describe looks at a topic without making one', async t => {
    const consumer = new FakeConsumer({topics: [{name: TOPIC, partitions: [{id: 0}, {id: 1}]}]});
    const admin = new FakeAdmin();
    const seen = await topicDescribe(clientsOf({consumer, admin}), connection, TOPIC);
    t.same(seen, {topic: TOPIC, exists: true, partitions: 2}, 'the shape the broker reports');
    t.equal(admin.created.length, 0, 'and nothing was created to find it out');
    const absent = await topicDescribe(
        clientsOf({consumer, admin}),
        connection,
        'blong.agent.other',
    );
    t.same(
        absent,
        {topic: 'blong.agent.other', exists: false, partitions: 0},
        'an absence is an answer',
    );
    t.end();
});

test('a refused connection fails the look instead of sitting out its timeout', async t => {
    class RefusingConsumer extends FakeConsumer {
        connect(): unknown {
            this.emit('event.error', {message: 'connect ECONNREFUSED 127.0.0.1:9092'});
            return this;
        }
    }
    await t.rejects(
        topicDescribe(clientsOf({consumer: new RefusingConsumer({topics: []})}), connection, TOPIC),
        /ECONNREFUSED/,
        'the broker’s own reason, at once',
    );
    t.end();
});

test('a declared topic is created and seeded when the broker holds nothing', async t => {
    const admin = new FakeAdmin();
    const consumer = new FakeConsumer({topics: []}, {0: {lowOffset: 0, highOffset: 0}});
    admin.onCreated = spec => {
        consumer.metadata = {
            topics: [
                {
                    name: spec.topic,
                    partitions: Array.from({length: spec.num_partitions}, (_, id) => ({id})),
                },
            ],
        };
    };
    const producer = new FakeProducer();
    const [outcome] = await topicProvision(
        clientsOf({consumer, producer, admin}),
        connection,
        [
            {
                topic: TOPIC,
                partitions: 1,
                required: true,
                seed: [{key: 'demo', value: '{"kind":"commander","message":"hello"}'}],
            },
        ],
        {create: true, resolve: resolveOf()},
    );
    t.equal(admin.created.length, 1, 'the broker was asked for the topic once');
    t.same(
        {created: outcome.created, exists: outcome.exists, seeded: outcome.seeded},
        {created: true, exists: true, seeded: 1},
        'the answer says what the call made and put in it',
    );
    t.same(
        producer.produced.map(message => message.key),
        ['demo'],
        'the seed message was produced, keyed as declared',
    );
    t.equal(outcome.required, true, 'and a topic that is there does not refuse anything');
    t.end();
});

/** A consumer that hands out what its watermarks say it holds, as a broker with rows does. */
class FilledConsumer extends FakeConsumer {
    values: (partition: number, offset: number) => string = (_partition, offset) => `row-${offset}`;

    assign(assignments: {topic: string; partition: number; offset: number}[]): unknown {
        const answer = super.assign(assignments);
        for (const assignment of assignments) {
            const high = this.watermarks[assignment.partition]?.highOffset ?? 0;
            for (let offset = assignment.offset; offset < high; offset += 1) {
                this.deliver({
                    partition: assignment.partition,
                    offset,
                    value: Buffer.from(this.values(assignment.partition, offset)),
                });
            }
        }
        return answer;
    }
}

test('a topic that already holds the seed is not seeded again', async t => {
    const seed = '{"kind":"commander","message":"hello"}';
    const consumer = new FilledConsumer(
        {topics: [{name: TOPIC, partitions: [{id: 0}]}]},
        {
            0: {lowOffset: 0, highOffset: 5},
        },
    );
    consumer.values = (_partition, offset) => (offset === 2 ? seed : `row-${offset}`);
    const producer = new FakeProducer();
    const [outcome] = await topicProvision(
        clientsOf({consumer, producer, admin: new FakeAdmin()}),
        connection,
        [{topic: TOPIC, seed: [{key: 'demo', value: seed}]}],
        {create: true, resolve: resolveOf()},
    );
    t.equal(outcome.created, false, 'the topic was already there');
    t.equal(outcome.seeded, 0, 'and the row it names is one of the records it holds');
    t.equal(producer.produced.length, 0, 'which is what makes a restart append no copy');
    t.end();
});

test('a topic that holds other rows but not the seed still gets it', async t => {
    const consumer = new FilledConsumer(
        {topics: [{name: TOPIC, partitions: [{id: 0}]}]},
        {
            0: {lowOffset: 0, highOffset: 4},
        },
    );
    const producer = new FakeProducer();
    const [outcome] = await topicProvision(
        clientsOf({consumer, producer, admin: new FakeAdmin()}),
        connection,
        [{topic: TOPIC, seed: [{key: 'demo', value: '{"kind":"commander"}'}]}],
        {create: true, resolve: resolveOf()},
    );
    t.equal(outcome.seeded, 1, 'another suite’s rows are not this declaration’s row');
    t.same(
        producer.produced.map(message => message.key),
        ['demo'],
        'so the seed is produced beside them, once',
    );
    t.end();
});

test('a required topic that is absent refuses the start, unless the config says otherwise', async t => {
    const consumer = new FakeConsumer({topics: []});
    await t.rejects(
        topicProvision(
            clientsOf({consumer}),
            connection,
            [{topic: `${TOPIC}.absent`, required: true}],
            {resolve: resolveOf()},
        ),
        /is required and is not present/,
        'a mandatory topic nothing made is a start that must not happen',
    );
    const [outcome] = await topicProvision(
        clientsOf({consumer}),
        connection,
        [{topic: `${TOPIC}.absent`, required: true}],
        {resolve: resolveOf(), failOnMissing: false},
    );
    t.same(
        {required: outcome.required, exists: outcome.exists, created: outcome.created},
        {required: true, exists: false, created: false},
        'and without the refusal the same fact is only reported',
    );
    t.end();
});

test('a declaration another instance owns is left to it', async t => {
    const consumer = new FakeConsumer({topics: []});
    const admin = new FakeAdmin();
    const outcomes = await topicProvision(
        clientsOf({consumer, admin}),
        connection,
        [{topic: 'blong.other.feed', partitions: 1, required: true}],
        {
            create: true,
            // The guard this instance answers with: `blong.agent.` is all it owns.
            resolve: resolveOf(),
        },
    );
    t.equal(admin.created.length, 0, 'nothing was created for a name this instance does not own');
    t.ok(outcomes[0].skipped, 'the declaration is reported as another instance’s');
    t.equal(outcomes[0].required, false, 'and cannot refuse this start');
    t.equal(
        outcomes[0].topic,
        'blong.other.feed',
        'the report names the declaration it left alone',
    );
    t.end();
});

test('a tenant instance creates the topic under its tenant and reports the logical name', async t => {
    const admin = new FakeAdmin();
    const consumer = new FakeConsumer({topics: []});
    admin.onCreated = spec => {
        consumer.metadata = {topics: [{name: spec.topic, partitions: [{id: 0}]}]};
    };
    const [outcome] = await topicProvision(
        clientsOf({consumer, admin}),
        connection,
        [{topic: TOPIC, partitions: 1, required: true}],
        {create: true, resolve: resolveOf({namespace: 'agent', tenant: 'kalin'})},
    );
    t.equal(
        admin.created[0].topic,
        'kalin.blong.agent.telemetry',
        'the broker was asked for the tenant’s name',
    );
    t.equal(outcome.topic, TOPIC, 'while the report speaks the name the realm declared');
    t.equal(outcome.physical, 'kalin.blong.agent.telemetry', 'and says where the topic really is');
    t.end();
});

test('a declaration that names the broker’s topic is taken at its word', async t => {
    const admin = new FakeAdmin();
    const consumer = new FakeConsumer({topics: []});
    admin.onCreated = spec => {
        consumer.metadata = {topics: [{name: spec.topic, partitions: [{id: 0}]}]};
    };
    const [outcome] = await topicProvision(
        clientsOf({consumer, admin}),
        connection,
        [{topic: TOPIC, physical: 'blong.shared.feed', partitions: 1, required: true}],
        {create: true, resolve: resolveOf({namespace: 'agent', tenant: 'kalin'})},
    );
    t.equal(
        admin.created[0].topic,
        'blong.shared.feed',
        'the broker was asked for the name the declaration wrote, with no tenant in front of it',
    );
    t.equal(outcome.topic, TOPIC, 'and the report keeps the key the realm declares');
    t.equal(outcome.physical, 'blong.shared.feed', 'beside where the rows really are');
    t.end();
});

test('topic.watch ends with the broker error that stopped it', async t => {
    const consumer = new FakeConsumer({topics: [{name: TOPIC, partitions: [{id: 0}]}]});
    const reading = (async () => {
        for await (const _record of topicWatch(clientsOf({consumer}), connection, {
            topic: TOPIC,
            starts: [{partition: 0, offset: 0}],
        })) {
            // no records are delivered; the broker fails first
        }
    })();
    await tick();
    consumer.emit('event.error', {message: 'all brokers are down'});
    await t.rejects(reading, /all brokers are down/, 'the reader is told, so it can resume');
    await tick();
    t.ok(consumer.disconnected, 'and the consumer it read with is gone');
});

test('message.send answers the partition and offset the broker reported', async t => {
    const producer = new FakeProducer();
    producer.report = {partition: 3, offset: 918273};
    const answer = await messageSend(clientsOf({producer}), connection, {
        topic: TOPIC,
        key: 'session-1',
        value: '{"kind":"message"}',
    });
    t.same(answer, {topic: TOPIC, partition: 3, offset: 918273}, 'where the message landed');
    t.equal(producer.produced[0].key, 'session-1', 'with the key it was given');
    t.equal(
        producer.produced[0].value.toString(),
        '{"kind":"message"}',
        'and the bytes it was given',
    );
    t.equal(
        producer.listeners.get('delivery-report')?.length ?? 0,
        0,
        'the report listener is gone once it has answered: the adapter keeps one producer',
    );
    t.ok(producer.disconnected, 'and a producer this call made is closed with it');
    t.end();
});

test('message.send borrows the producer it is given and leaves it open', async t => {
    const producer = new FakeProducer();
    producer.report = {partition: 1, offset: 4};
    for (const offset of [4, 5]) {
        producer.report = {partition: 1, offset};
        const answer = await messageSend(
            clientsOf({producer}),
            connection,
            {topic: TOPIC, key: 'session-1', value: '{}'},
            {producer},
        );
        t.equal(answer.offset, offset, 'each send answers its own report');
    }
    t.equal(producer.produced.length, 2, 'both went through the one producer');
    t.notOk(producer.disconnected, 'which the caller keeps for the next message');
    t.end();
});

test('message.send fails when the broker refuses the message', async t => {
    const producer = new FakeProducer();
    producer.report = null;
    producer.reportError = {message: 'unknown topic or partition'};
    await t.rejects(
        messageSend(clientsOf({producer}), connection, {topic: TOPIC, value: '{}'}),
        /unknown topic or partition/,
        'the delivery report is the only place a refusal is visible',
    );
    t.end();
});

/*
 * The clients a topic picks (`@@D-1035`), and the feed that puts one to work (`@@D-1036`).
 */

test('a topic pattern is a glob over its own name, dots included', t => {
    t.ok(patternMatches('blong.agent.*', 'blong.agent.telemetry'), 'a star covers a segment');
    t.notOk(patternMatches('blong.agent.*', 'blong.commander.telemetry'), 'and only its own');
    t.ok(patternMatches('blong.?gent.telemetry', TOPIC), 'a question mark covers one character');
    t.ok(patternMatches(TOPIC, TOPIC), 'a literal pattern is the name itself');
    t.notOk(patternMatches('blong.agentx', 'blong.agent'), 'a literal pattern is not a prefix');
    t.end();
});

test('a topic resolves to the first spec whose pattern names it, else to default', t => {
    const map: Record<string, {topics?: string[]}> = {
        work: {topics: ['blong.agent.work.*']},
        everything: {topics: ['blong.agent.*']},
        default: {},
    };
    t.equal(
        matchSpec(map, 'blong.agent.work.queue', 'producer').alias,
        'work',
        'the first match wins',
    );
    t.equal(matchSpec(map, TOPIC, 'producer').alias, 'everything', 'a broader spec takes the rest');
    t.equal(
        matchSpec(map, 'other.topic', 'producer').alias,
        'default',
        'and default takes what none named',
    );
    t.equal(
        matchSpec({only: {}}, 'other.topic', 'producer').alias,
        'only',
        'a map of one needs no default',
    );
    t.throws(
        () => matchSpec({a: {topics: ['a.*']}, b: {topics: ['b.*']}}, 'c', 'producer'),
        /No kafka producer carries the topic c/,
        'and a topic nobody claims is an error that names it',
    );
    t.end();
});

test('a client setting outside its kind table is refused before it reaches librdkafka', t => {
    t.same(
        clientConfigOf('producer', {acks: 'all', 'linger.ms': 0}, 'kafka producer "p"'),
        {acks: 'all', 'linger.ms': 0},
        'the settings a producer may write',
    );
    t.throws(
        () => clientConfigOf('producer', {acsk: 'all'}, 'kafka producer "p"'),
        /"acsk" is not a librdkafka producer setting/,
        'a misspelt name is refused rather than ignored',
    );
    t.throws(
        () => clientConfigOf('producer', {acks: 1}, 'kafka producer "p"'),
        /"acks" is a string/,
        'and a value of the wrong kind with it',
    );
    t.throws(
        () => consumerSpecOf({config: {'group.id': 'x'}}, 'kafka consumer "c"'),
        /"group.id" is written as "groupId"/,
        'group.id belongs to the spec, because it is what carries the tenant',
    );
    t.same(
        consumerSpecOf({topics: [TOPIC], groupId: 'g', assign: true}, 'kafka consumer "c"'),
        {topics: [TOPIC], groupId: 'g', assign: true, config: {}},
        'and everything else is taken as written',
    );
    t.end();
});

test('a feed is a consumer that also says how it commits and fails', t => {
    const spec = feedSpecOf(
        {
            topics: [TOPIC],
            groupId: 'g',
            concurrency: 4,
            attempts: 2,
            deadLetter: 'x.dead',
            commit: 10,
        },
        'kafka feed "f"',
    );
    t.equal(spec.concurrency, 4, 'the concurrency the spec names');
    t.equal(spec.attempts, 2, 'the attempts it names');
    t.equal(spec.deadLetter, 'x.dead', 'the dead letter it names');
    t.same(spec.commit, {every: 10}, 'a count is a commit timetable');
    t.throws(
        () => feedSpecOf({concurrency: 0}, 'kafka feed "f"'),
        /"concurrency" is a whole number of at least one/,
        'a concurrency of none is refused',
    );
    t.throws(
        () => feedSpecOf({commit: {every: 0}}, 'kafka feed "f"'),
        /"commit.every" is a whole number of at least one/,
        'and so is an empty commit window',
    );
    t.end();
});

/** A loop that dispatches one record the way the framework's does, without the framework. */
const pumpOf =
    (
        stream: {on(event: 'data', listener: (frame: Message) => void): unknown},
        afterDispatch: (
            frame: unknown,
            packet: unknown[],
            outcome: unknown[] | undefined,
        ) => Promise<void>,
        handle: (params: unknown, $meta: Record<string, unknown>) => Promise<unknown>,
    ) =>
    (decode: (frame: unknown, $meta: Record<string, unknown>) => Promise<unknown>): void => {
        stream.on('data', frame => {
            void (async () => {
                const $meta: Record<string, unknown> = {
                    mtid: 'request',
                    method: 'feed.record.handle',
                };
                const params = await decode(frame, $meta);
                const answer = await handle(params, $meta).catch(error => {
                    $meta.mtid = 'error';
                    $meta.errorMessage = (error as Error).message;
                    return error;
                });
                const packet = [params, $meta];
                // A handler that answered nothing leaves no outcome, exactly as `$meta.mtid =
                // 'discard'` does in the real loop.
                const outcome = answer === undefined ? undefined : [answer, $meta];
                await afterDispatch(frame, packet, outcome);
            })();
        });
    };

const recordBody = (offset: number): Message =>
    ({topic: TOPIC, partition: 0, offset, size: 0, value: Buffer.from(String(offset))}) as Message;

test('a feed commits a record only once it has been processed', async t => {
    const consumer = new FakeConsumer();
    const produced: {topic: string; value: string}[] = [];
    let pumping = false;
    const feed = await openFeed({
        alias: 'work',
        spec: {topics: [TOPIC], groupId: 'work-group', commit: {every: 1, ms: 10_000}},
        config: {},
        clients: clientsOf({consumer}),
        connection,
        produce: async (topic, message) => {
            produced.push({topic, value: message.value});
        },
        decode: async frame => ({offset: (frame as Message).offset}),
        connect: async (stream, afterDispatch, decode) => {
            pumping = true;
            pumpOf(stream, afterDispatch, async () => undefined)(decode);
        },
    });
    t.same(consumer.subscriptions[0], [TOPIC], 'the feed subscribes to what it was given');
    t.equal(consumer.committed.length, 0, 'and nothing is committed before a record is read');

    consumer.deliver(recordBody(0));
    await tick(10);
    t.same(
        consumer.committed,
        [{topic: TOPIC, partition: 0, offset: 1}],
        'the record is committed at the offset after it, because it was processed',
    );
    t.equal(feed.stats().processed, 1, 'and the feed counts it');
    t.ok(pumping, 'the loop was installed before anything was polled');
    await feed.stop();
    t.ok(consumer.disconnected, 'and the consumer is gone with it');
    t.end();
});

test('a feed retries a record that throws and commits it only after the dead letter', async t => {
    const consumer = new FakeConsumer();
    const produced: {
        topic: string;
        value: string;
        key?: string | null;
        headers?: {name: string; value: Buffer}[];
    }[] = [];
    let attempts = 0;
    await openFeed({
        alias: 'work',
        spec: {
            topics: [TOPIC],
            groupId: 'work-group',
            attempts: 3,
            deadLetter: 'blong.agent.dead',
            commit: {every: 1, ms: 10_000},
        },
        config: {},
        clients: clientsOf({consumer}),
        connection,
        produce: async (topic, message) => {
            produced.push({topic, ...message});
        },
        decode: async frame => ({offset: (frame as Message).offset}),
        connect: async (stream, afterDispatch, decode) => {
            pumpOf(stream, afterDispatch, async () => {
                attempts += 1;
                throw new Error('handler refused it');
            })(decode);
        },
    });
    consumer.deliver(recordBody(7));
    await tick(600);
    t.equal(attempts, 3, 'the record is tried as often as the feed says');
    t.equal(produced.length, 1, 'then it is produced once');
    t.equal(produced[0].topic, 'blong.agent.dead', 'to the dead letter the feed names');
    t.equal(produced[0].value, '7', 'carrying its own bytes');
    t.same(
        produced[0].headers?.map(header => header.name),
        [
            'x-blong-error',
            'x-blong-attempts',
            'x-blong-topic',
            'x-blong-partition',
            'x-blong-offset',
            'x-blong-feed',
        ],
        'and the reason it is there',
    );
    t.same(
        consumer.committed,
        [{topic: TOPIC, partition: 0, offset: 8}],
        'only then is it committed, never before',
    );
    t.end();
});

test('a feed commits the contiguous prefix and never passes an outstanding record', async t => {
    const consumer = new FakeConsumer();
    let failing = true;
    await openFeed({
        alias: 'work',
        spec: {
            topics: [TOPIC],
            groupId: 'work-group',
            concurrency: 2,
            attempts: 2,
            commit: {every: 1, ms: 10_000},
        },
        config: {},
        clients: clientsOf({consumer}),
        connection,
        produce: async () => undefined,
        decode: async frame => ({offset: (frame as Message).offset}),
        connect: async (stream, afterDispatch, decode) => {
            pumpOf(stream, afterDispatch, async params => {
                if (failing && (params as {offset: number}).offset === 0)
                    throw new Error('the first one fails');
                return undefined;
            })(decode);
        },
    });
    consumer.deliver(recordBody(0));
    consumer.deliver(recordBody(1));
    await tick(20);
    t.same(
        consumer.committed,
        [],
        'a finished second record cannot be committed past a failing first',
    );
    failing = false;
    await tick(400);
    t.same(
        consumer.committed.at(-1),
        {topic: TOPIC, partition: 0, offset: 2},
        'once the first is through, both are committed — the prefix reaches the end',
    );
    t.end();
});

test('a feed holds as many records in flight as its concurrency, and no more', async t => {
    const consumer = new FakeConsumer();
    const parked: (() => void)[] = [];
    let entered = 0;
    let peak = 0;
    const feed = await openFeed({
        alias: 'work',
        spec: {
            topics: [TOPIC],
            groupId: 'work-group',
            concurrency: 3,
            commit: {every: 1, ms: 10_000},
        },
        config: {},
        clients: clientsOf({consumer}),
        connection,
        produce: async () => undefined,
        decode: async frame => ({offset: (frame as Message).offset}),
        connect: async (stream, afterDispatch, decode) => {
            pumpOf(stream, afterDispatch, async () => {
                entered += 1;
                peak = Math.max(peak, entered);
                await new Promise<void>(resolve => parked.push(resolve));
                entered -= 1;
            })(decode);
        },
    });
    for (const offset of [0, 1, 2, 3, 4]) consumer.deliver(recordBody(offset));
    await tick(10);
    t.equal(entered, 3, 'three records are in flight, which is the concurrency it was given');
    // Release them a wave at a time: each finished record frees a slot for the next.
    for (let wave = 0; wave < 3 && parked.length; wave++) {
        for (const done of parked.splice(0)) done();
        await tick(20);
    }
    t.equal(peak, 3, 'and never more than that at once');
    t.equal(feed.stats().processed, 5, 'every record the broker delivered was processed');
    t.same(
        consumer.committed.at(-1),
        {topic: TOPIC, partition: 0, offset: 5},
        'and the commit reaches the end of what was seen',
    );
    await feed.stop();
    t.end();
});

test('a feed commits on its timetable as well as on its count', async t => {
    const consumer = new FakeConsumer();
    const feed = await openFeed({
        alias: 'work',
        // A count no run reaches, so the only thing that can commit is the clock.
        spec: {topics: [TOPIC], groupId: 'work-group', commit: {every: 1_000, ms: 20}},
        config: {},
        clients: clientsOf({consumer}),
        connection,
        produce: async () => undefined,
        decode: async frame => ({offset: (frame as Message).offset}),
        connect: async (stream, afterDispatch, decode) => {
            pumpOf(stream, afterDispatch, async () => undefined)(decode);
        },
    });
    consumer.deliver(recordBody(0));
    await tick(10);
    t.same(consumer.committed, [], 'the count is not reached, so nothing is committed yet');
    await tick(60);
    t.same(
        consumer.committed,
        [{topic: TOPIC, partition: 0, offset: 1}],
        'the timetable commits it without waiting for a record count',
    );
    await feed.stop();
    t.end();
});

test('a stopping feed commits what it processed, so a restart resumes after it', async t => {
    const consumer = new FakeConsumer();
    const feed = await openFeed({
        alias: 'work',
        // Neither the count nor the timetable can fire inside this test: only `stop()` can.
        spec: {topics: [TOPIC], groupId: 'work-group', commit: {every: 1_000, ms: 10_000}},
        config: {},
        clients: clientsOf({consumer}),
        connection,
        produce: async () => undefined,
        decode: async frame => ({offset: (frame as Message).offset}),
        connect: async (stream, afterDispatch, decode) => {
            pumpOf(stream, afterDispatch, async () => undefined)(decode);
        },
    });
    consumer.deliver(recordBody(3));
    await tick(10);
    t.equal(feed.stats().processed, 1, 'the record is processed');
    t.same(consumer.committed, [], 'and still uncommitted while the feed runs');
    await feed.stop();
    t.same(
        consumer.committed,
        [{topic: TOPIC, partition: 0, offset: 4}],
        'the stop commits it, so the next start resumes at the record after it',
    );
    t.end();
});

test('a commit the broker refuses is offered again rather than forgotten', async t => {
    const consumer = new FakeConsumer();
    consumer.commitError = {message: 'the group is rebalancing'};
    const feed = await openFeed({
        alias: 'work',
        spec: {topics: [TOPIC], groupId: 'work-group', commit: {every: 1, ms: 10_000}},
        config: {},
        clients: clientsOf({consumer}),
        connection,
        produce: async () => undefined,
        decode: async frame => ({offset: (frame as Message).offset}),
        connect: async (stream, afterDispatch, decode) => {
            pumpOf(stream, afterDispatch, async () => undefined)(decode);
        },
    });
    consumer.deliver(recordBody(0));
    await tick(20);
    t.same(consumer.committed, [], 'a refused commit stores nothing');
    consumer.commitError = null;
    consumer.deliver(recordBody(1));
    await tick(20);
    t.same(
        consumer.committed,
        [{topic: TOPIC, partition: 0, offset: 2}],
        'and the offsets it kept are offered with the next flush, so nothing is lost',
    );
    t.equal(feed.stats().processed, 2, 'both records were still processed');
    await feed.stop();
    t.end();
});

test('a record that fails once is retried, committed, and never dead-lettered', async t => {
    const consumer = new FakeConsumer();
    const produced: {topic: string}[] = [];
    let calls = 0;
    await openFeed({
        alias: 'work',
        spec: {
            topics: [TOPIC],
            groupId: 'work-group',
            attempts: 3,
            deadLetter: 'blong.agent.dead',
            commit: {every: 1, ms: 10_000},
        },
        config: {},
        clients: clientsOf({consumer}),
        connection,
        produce: async topic => {
            produced.push({topic});
        },
        decode: async frame => ({offset: (frame as Message).offset}),
        connect: async (stream, afterDispatch, decode) => {
            pumpOf(stream, afterDispatch, async () => {
                calls += 1;
                if (calls === 1) throw new Error('the first attempt lost a race');
            })(decode);
        },
    });
    consumer.deliver(recordBody(0));
    await tick(400);
    t.equal(calls, 2, 'the record is tried twice');
    t.same(produced, [], 'and the second attempt is enough: nothing is dead-lettered');
    t.same(
        consumer.committed,
        [{topic: TOPIC, partition: 0, offset: 1}],
        'it is committed the moment it succeeds',
    );
    t.end();
});

test('a feed with no dead letter retries the record and never commits past it', async t => {
    const consumer = new FakeConsumer();
    let calls = 0;
    const feed = await openFeed({
        alias: 'work',
        spec: {topics: [TOPIC], groupId: 'work-group', commit: {every: 1, ms: 10_000}},
        config: {},
        clients: clientsOf({consumer}),
        connection,
        produce: async () => {
            throw new Error('nothing may be produced');
        },
        decode: async frame => ({offset: (frame as Message).offset}),
        connect: async (stream, afterDispatch, decode) => {
            pumpOf(stream, afterDispatch, async () => {
                calls += 1;
                throw new Error('refused');
            })(decode);
        },
    });
    consumer.deliver(recordBody(9));
    await tick(500);
    t.ok(calls >= 3, `the record keeps being tried (${calls} attempts, three by default)`);
    t.same(
        consumer.committed,
        [],
        'and the window never moves: an unprocessed record is never committed past',
    );
    t.equal(feed.stats().deadLettered, 0, 'nothing is dead-lettered when no topic was named');
    await feed.stop();
    t.end();
});

test('a dead letter that cannot be produced keeps the record outstanding', async t => {
    const consumer = new FakeConsumer();
    let produced = 0;
    let calls = 0;
    const feed = await openFeed({
        alias: 'work',
        spec: {
            topics: [TOPIC],
            groupId: 'work-group',
            attempts: 2,
            deadLetter: 'blong.agent.dead',
            commit: {every: 1, ms: 10_000},
        },
        config: {},
        clients: clientsOf({consumer}),
        connection,
        produce: async () => {
            produced += 1;
            throw new Error('the dead letter is not on the broker');
        },
        decode: async frame => ({offset: (frame as Message).offset}),
        connect: async (stream, afterDispatch, decode) => {
            pumpOf(stream, afterDispatch, async () => {
                calls += 1;
                throw new Error('refused');
            })(decode);
        },
    });
    consumer.deliver(recordBody(1));
    await tick(500);
    t.ok(produced >= 2, 'the record is offered to the dead letter more than once');
    t.ok(calls >= 2, 'and it is dispatched again after each attempt to dispose of it fails');
    t.same(consumer.committed, [], 'and it is never committed, because it was never disposed of');
    t.equal(feed.stats().deadLettered, 0, 'a dead letter that failed is not counted as one');
    await feed.stop();
    t.end();
});

test('each send answers its own delivery report while several are in flight', async t => {
    const producer = new OrderedProducer();
    const clients = clientsOf({producer});
    const first = messageSend(clients, connection, {topic: 'blong.a', value: '1'}, {producer});
    const second = messageSend(clients, connection, {topic: 'blong.b', value: '2'}, {producer});
    await tick();
    t.equal(producer.pending.length, 2, 'both sends are in flight on the one producer');
    // The second produce is answered first: the broker does not answer in the order it was asked.
    producer.answerOf('blong.b', 11);
    t.same(
        await second,
        {topic: 'blong.b', partition: 0, offset: 11},
        'the send answers the report that carries its own correlation',
    );
    let firstSettled = false;
    void first.then(() => (firstSettled = true));
    // A report whose correlation belongs to nobody is neither send's answer.
    producer.answerOf('blong.a', 22, {not: 'the correlation it was given'});
    await tick();
    t.notOk(firstSettled, 'a foreign report leaves a waiting send waiting');
    producer.answerOf('blong.a', 22);
    t.same(
        await first,
        {topic: 'blong.a', partition: 0, offset: 22},
        'and its own report answers it',
    );
    t.notOk(producer.disconnected, 'the producer outlives both sends, because the caller keeps it');
    t.end();
});

test('a feed never auto-commits, and joins its group under the tenant', async t => {
    const consumer = new FakeConsumer();
    const built: Record<string, unknown>[] = [];
    const feed = await openFeed({
        alias: 'work',
        spec: {topics: [TOPIC], groupId: 'work-group', commit: {every: 1, ms: 10_000}},
        // A tenant written the way a config would carry it: the group is reduced to what a name
        // may hold, exactly as a topic is (`@@D-1003`).
        config: {tenant: 'Acme'},
        clients: {
            consumer: connection => {
                built.push(connection as Record<string, unknown>);
                return consumer;
            },
            producer: () => new FakeProducer(),
            admin: () => new FakeAdmin(),
        },
        connection,
        produce: async () => undefined,
        decode: async () => ({}),
        connect: async () => undefined,
    });
    t.equal(built.length, 1, 'the feed makes one consumer of its own');
    t.equal(built[0]['enable.auto.commit'], false, 'auto-commit is off, whatever a spec would say');
    t.equal(built[0]['enable.auto.offset.store'], false, 'and so is storing an offset on delivery');
    t.equal(built[0]['group.id'], 'acme.work-group', 'the group carries the tenant in front of it');
    t.throws(
        () => feedSpecOf({config: {'enable.auto.commit': true}}, 'kafka feed "f"'),
        /"enable.auto.commit" is off for a feed/,
        'a spec that asks for auto-commit is refused rather than overridden',
    );
    await feed.stop();
    t.end();
});
