/**
 * A topic's shape and settings: what the broker holds, what a declaration asks for, and the
 * checks that keep the second from being silently ignored by the first (`@@D-1034`).
 */
import type {VocabularyProxy} from '@feasibleone/blong/types';

import {
    freshGroup,
    type IKafkaClients,
    type KafkaConfig,
    messageOf,
    metadataOf,
    partitionIdsOf,
    whenReady,
} from './clients.ts';
import {topicWatch} from './consume.ts';

export interface IKafkaPartitionOffset {
    partition: number;
    low: number;
    high: number;
}

/**
 * `{ns}.topic.offsets` — every partition of a topic beside its watermarks (`@@T-783`).
 *
 * A reader that wants "the last N messages" cannot ask for them: a partition interleaves every
 * session that hashes to it, so the tail is computed per partition, from `high`, and filtered by
 * key afterwards. There is deliberately no mapping from a key to a partition here — the adapter
 * configures no partitioner, so librdkafka's own decides, and the only place that fact is visible
 * is a delivery report (`@@D-996`).
 */
export async function topicOffsets(
    clients: IKafkaClients,
    connection: KafkaConfig,
    topic: string,
    options: {timeoutMs?: number; signal?: VocabularyProxy} = {},
): Promise<{topic: string; partitions: IKafkaPartitionOffset[]}> {
    const timeoutMs = options.timeoutMs ?? 5_000;
    const startedAt = Date.now();
    const consumer = clients.consumer(
        {...connection, 'group.id': freshGroup('offsets')},
        {'auto.offset.reset': 'earliest'},
    );
    try {
        await whenReady(consumer);
        const partitions = await Promise.all(
            (await partitionIdsOf(consumer, topic, {timeoutMs})).map(
                partition =>
                    new Promise<IKafkaPartitionOffset>((resolve, reject) => {
                        consumer.queryWatermarkOffsets(
                            topic,
                            partition,
                            timeoutMs,
                            (error, offsets) => {
                                if (error || !offsets) {
                                    reject(
                                        new Error(
                                            error?.message ??
                                                `Kafka holds no watermarks for ${topic}[${partition}]`,
                                        ),
                                    );
                                    return;
                                }
                                resolve({
                                    partition,
                                    low: offsets.lowOffset,
                                    high: offsets.highOffset,
                                });
                            },
                        );
                    }),
            ),
        );
        options.signal?.frameworkKafkaTopicRead?.({
            topic,
            count: partitions.length,
            elapsedMs: Date.now() - startedAt,
        });
        return {topic, partitions};
    } catch (error) {
        options.signal?.frameworkKafkaTopicFailed?.({topic, error: messageOf(error)});
        throw error;
    } finally {
        try {
            consumer.disconnect();
        } catch {
            // A consumer that never connected has nothing to leave behind.
        }
    }
}

/** A topic config as a declaration or a call writes it: Kafka's own keys, a scalar or a list. */
export type ITopicConfig = Record<string, string | number | boolean | string[]>;

/** What a config value's name says its value is, which is the check the broker would make. */
export type ConfigKind = 'int' | 'long' | 'double' | 'boolean' | 'string' | 'list';

/**
 * The topic configs a declaration may write, with the kind of value each takes (`@@D-1034`).
 *
 * The names are Kafka's own, because they are passed to the broker unchanged: a declaration is the
 * topic's config, not a translation of it. `partitions` and `replicationFactor` are not here — they
 * are arguments of the create, not settings of the log — and neither are the declaration's own
 * fields, which are lifted out before this table is consulted.
 */
export const TOPIC_CONFIG_KIND: Record<string, ConfigKind> = {
    'cleanup.policy': 'list',
    'compression.type': 'string',
    'delete.retention.ms': 'long',
    'file.delete.delay.ms': 'long',
    'flush.messages': 'long',
    'flush.ms': 'long',
    'follower.replication.throttled.replicas': 'list',
    'index.interval.bytes': 'int',
    'leader.replication.throttled.replicas': 'list',
    'local.retention.bytes': 'long',
    'local.retention.ms': 'long',
    'max.compaction.lag.ms': 'long',
    'max.message.bytes': 'int',
    'message.downconversion.enable': 'boolean',
    'message.format.version': 'string',
    'message.timestamp.after.max.ms': 'long',
    'message.timestamp.before.max.ms': 'long',
    'message.timestamp.difference.max.ms': 'long',
    'message.timestamp.type': 'string',
    'min.cleanable.dirty.ratio': 'double',
    'min.compaction.lag.ms': 'long',
    'min.insync.replicas': 'int',
    preallocate: 'boolean',
    'remote.log.delete.on.disable': 'boolean',
    'remote.storage.enable': 'boolean',
    'retention.bytes': 'long',
    'retention.ms': 'long',
    'segment.bytes': 'int',
    'segment.index.bytes': 'int',
    'segment.jitter.ms': 'long',
    'segment.ms': 'long',
    'unclean.leader.election.enable': 'boolean',
};

/** A value checked against the kind its name declares (`@@D-1034`). */
export function configValueOf(kind: ConfigKind, value: unknown, where: string): string | number | boolean | string[] {
    switch (kind) {
        case 'int':
        case 'long':
            if (typeof value !== 'number' || !Number.isInteger(value)) {
                throw new Error(`${where} is a whole number`);
            }
            return value;
        case 'double':
            if (typeof value !== 'number' || !Number.isFinite(value)) {
                throw new Error(`${where} is a number`);
            }
            return value;
        case 'boolean':
            if (typeof value !== 'boolean') throw new Error(`${where} is true or false`);
            return value;
        case 'string':
            if (typeof value !== 'string') throw new Error(`${where} is a string`);
            return value;
        case 'list':
            if (typeof value === 'string') return value;
            if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
                throw new Error(`${where} is a string or a list of strings`);
            }
            return value;
    }
}

/**
 * A topic's configs, checked (`@@D-1034`).
 *
 * A name outside the table is refused rather than passed on: a broker accepts a create with a
 * misspelt setting and then ignores it, so the mistake would only show as a topic whose retention
 * is not the one the declaration wrote. A value is checked against the kind its name declares, which
 * is the same check the broker would make — earlier, and with the file and the topic in the message.
 */
export function topicConfigOf(value: unknown, source: string): ITopicConfig {
    if (value === undefined || value === null) return {};
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${source}: a topic's config is a map of Kafka's own config names`);
    }
    const config: ITopicConfig = {};
    for (const [name, entry] of Object.entries(value as Record<string, unknown>)) {
        const kind = TOPIC_CONFIG_KIND[name];
        if (!kind) throw new Error(`${source}: "${name}" is not a Kafka topic config`);
        config[name] = configValueOf(kind, entry, `${source}: "${name}"`);
    }
    return config;
}

export interface ITopicSpec {
    topic: string;
    /** The partitions the topic must have. Defaults to one, which is what auto-create gives. */
    partitions?: number;
    /** The copies each partition keeps. Defaults to one, which is what a single broker holds. */
    replicationFactor?: number;
    /** The topic's configs, named as Kafka names them (`retention.ms`, `cleanup.policy`, …). */
    config?: ITopicConfig;
}

export interface ITopicShape {
    topic: string;
    /** True when this call made the topic; false when it was already there. */
    created: boolean;
    /** The partitions the topic has now. */
    partitions: number;
    /** False when the topic existed with another shape — a broker cannot be asked to reshape it. */
    matches: boolean;
}

const EXISTS = /exist/i;

/**
 * `{ns}.topic.create` — a topic of the shape it is asked for, once (`@@T-784`).
 *
 * Idempotent on purpose: an integration run names the same topic on every start, and the second
 * call must neither create it again nor fail. A topic that is already there with another shape is
 * reported rather than reshaped, because reshaping means deleting what the topic holds — and the
 * caller that wants that can say so by deleting it first, deliberately.
 */
export async function topicCreate(
    clients: IKafkaClients,
    connection: KafkaConfig,
    spec: ITopicSpec,
): Promise<ITopicShape> {
    const asked = spec.partitions ?? 1;
    // The broker takes every config as a string, and a list in the comma-separated form the CLI
    // writes (`@@D-1034`).
    const config = Object.fromEntries(
        Object.entries(spec.config ?? {}).map(([name, value]) => [
            name,
            Array.isArray(value) ? value.join(',') : String(value),
        ]),
    );
    const consumer = clients.consumer(
        {...connection, 'group.id': freshGroup('create')},
        {'auto.offset.reset': 'earliest'},
    );
    try {
        await whenReady(consumer);
        // The shape is read before anything is created: the second call of a pair answers from
        // this and never reaches the broker's admin API.
        const existing = await partitionIdsOf(consumer, spec.topic, {attempts: 1}).catch(() => null);
        if (existing) {
            return {
                topic: spec.topic,
                created: false,
                partitions: existing.length,
                matches: existing.length === asked,
            };
        }
        let created = true;
        const admin = clients.admin(connection);
        try {
            await new Promise<void>((resolve, reject) => {
                admin.createTopic(
                    {
                        topic: spec.topic,
                        num_partitions: asked,
                        replication_factor: spec.replicationFactor ?? 1,
                        config,
                    },
                    error => {
                        if (error) {
                            reject(new Error(error.message ?? 'Kafka topic create failed'));
                            return;
                        }
                        resolve();
                    },
                );
            });
        } catch (error) {
            // A name taken between the look and the create is the same idempotent second call, and
            // the shape below is what the answer reports.
            if (!EXISTS.test(messageOf(error))) throw error;
            created = false;
        } finally {
            try {
                admin.disconnect();
            } catch {
                // Nothing to leave behind.
            }
        }
        // Broker metadata trails the create by a moment: a single look answers "no such topic" for
        // one that was just made.
        const partitions = await partitionIdsOf(consumer, spec.topic, {
            attempts: created ? 20 : 1,
        });
        return {
            topic: spec.topic,
            created,
            partitions: partitions.length,
            matches: created || partitions.length === asked,
        };
    } finally {
        try {
            consumer.disconnect();
        } catch {
            // A consumer that never connected has nothing to leave behind.
        }
    }
}

/** What the broker says about a topic, without changing it (`@@D-1001`). */
export interface ITopicSeen {
    topic: string;
    exists: boolean;
    partitions: number;
}

/**
 * Whether the broker has a topic, and the partitions it reports (`@@D-1001`).
 *
 * A look, not a create: a caller that is only verifying must not change what the broker holds. An
 * absent topic is an answer (`exists: false`), while a broker that could not be read at all rejects
 * — the two are not the same fact, and only one of them is a topic's absence.
 */
export async function topicDescribe(
    clients: IKafkaClients,
    connection: KafkaConfig,
    topic: string,
    options: {timeoutMs?: number} = {},
): Promise<ITopicSeen> {
    const timeoutMs = options.timeoutMs ?? 5_000;
    const consumer = clients.consumer(
        {...connection, 'group.id': freshGroup('describe')},
        {'auto.offset.reset': 'earliest'},
    );
    try {
        await whenReady(consumer, timeoutMs);
        const metadata = await metadataOf(consumer, timeoutMs);
        const found = metadata.topics?.find(candidate => candidate.name === topic);
        return {topic, exists: Boolean(found), partitions: found?.partitions?.length ?? 0};
    } finally {
        try {
            consumer.disconnect();
        } catch {
            // A consumer that never connected has nothing to leave behind.
        }
    }
}

/**
 * Whether a topic already carries one of these values (`@@D-1001`).
 *
 * The message is the guard, not the topic: a broker that keeps its volume also carries whatever
 * another suite appended, and a topic with rows in it is not a topic that already holds this
 * declaration's row (`F-121@test/blong-int-adapter`). The read starts at each partition's first
 * offset, where a seed lands, and stops at the high watermark it was given, so a feed of a few rows
 * is read exactly once. `unknown` is a topic that did not deliver inside the budget — a feed that
 * big is not a demo feed, and appending another row to it would be noise rather than a repair.
 */
export async function topicHolds(
    clients: IKafkaClients,
    connection: KafkaConfig,
    topic: string,
    values: string[],
    options: {budgetMs?: number} = {},
): Promise<'present' | 'absent' | 'unknown'> {
    const wanted = new Set(values);
    const offsets = await topicOffsets(clients, connection, topic);
    const total = offsets.partitions.reduce(
        (sum, partition) => sum + Math.max(0, partition.high - partition.low),
        0,
    );
    if (total === 0) return 'absent';
    const starts = offsets.partitions
        .filter(partition => partition.low < partition.high)
        .map(partition => ({partition: partition.partition, offset: partition.low}));
    const controller = new AbortController();
    let timedOut = false;
    const deadline = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, options.budgetMs ?? 3_000);
    let read = 0;
    try {
        for await (const record of topicWatch(clients, connection, {
            topic,
            starts,
            $meta: {abort: controller.signal},
        })) {
            if (record.value !== undefined && wanted.has(record.value)) return 'present';
            if (++read >= total) return 'absent';
        }
        return timedOut ? 'unknown' : 'absent';
    } finally {
        clearTimeout(deadline);
        controller.abort();
    }
}
