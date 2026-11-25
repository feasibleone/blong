import type {Message} from 'node-rdkafka';
import {test} from 'tap';

import {
    claimTopic,
    type IKafkaAdmin,
    type IKafkaClients,
    type IKafkaConsumer,
    type IKafkaProducer,
    messageSend,
    startsOf,
    topicCreate,
    topicNamespace,
    topicOffsets,
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
    metadata: Metadata;
    watermarks: Record<number, {lowOffset: number; highOffset: number}>;
    consuming = false;

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
    ): unknown {
        this.produced.push({topic, partition, value, key, opaque});
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
        retentionMs: 600_000,
        cleanupPolicy: 'delete',
    });
    t.equal(admin.created.length, 1, 'the broker was asked once');
    t.equal(admin.created[0].num_partitions, 12, 'for the partitions the caller needs');
    t.same(
        admin.created[0].config,
        {'retention.ms': '600000', 'cleanup.policy': 'delete'},
        'with a retention that ends the topic’s own history',
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
