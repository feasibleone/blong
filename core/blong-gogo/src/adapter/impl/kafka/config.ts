/**
 * The clients one adapter instance may open, and how a topic picks one (`@@D-1035`).
 *
 * The two maps are keyed by alias and carry one client's settings each. A logical topic resolves to
 * a spec by the `topics` patterns that spec writes, and to the spec named `default` when none
 * matches; the patterns are matched against the **logical** name, so the tenant prefix and the
 * `physical:` marker play no part in the choice (`@@D-1003`).
 */
import type {KafkaProducerConfig, KafkaTopicConfig} from './clients.ts';

/** One producer's settings (`@@D-1035`). */
export interface IProducerSpec {
    /** The logical topics this producer carries, as globs. Absent means "the default for the rest". */
    topics?: string[];
    /** The producer's own librdkafka settings, checked before they reach the client. */
    config?: KafkaProducerConfig;
    /** Open the client during `start()`, so a deployment fails its migration step, not its first send. */
    eager?: boolean;
    /** Reserved: a transactional producer is not written yet (`@@T-843`). */
    transactionalId?: string;
}

/** One consumer's settings (`@@D-1035`). */
export interface IConsumerSpec {
    /** The logical topics this consumer reads, as globs. Absent means "the default for the rest". */
    topics?: string[];
    /**
     * The group the consumer joins, under this instance's tenant (`@@D-1003`).
     *
     * A consumer that assigns its own partitions joins no group, and so has nothing to commit —
     * but `node-rdkafka` still demands the property, and a reader that watches a page keeps one so
     * a second reader of the same page does not take half the partitions (`@@D-989`).
     */
    groupId?: string;
    /** Read partitions directly instead of joining the group — the shape a viewer uses. */
    assign?: boolean;
    /** The consumer's own librdkafka settings, checked before they reach the client. */
    config?: KafkaTopicConfig;
}

/** How often a feed commits what it has processed (`@@D-1036`). */
export interface ICommitPolicy {
    /** Commit after this many records. */
    every?: number;
    /** Or after this long, whichever comes first. */
    ms?: number;
}

/**
 * One background feed: the read side put to work (`@@D-1036`).
 *
 * It repeats the consumer fields rather than pointing at a `consumer` entry, because a feed is not
 * a reader other things share — it is a subscription, and its policy belongs beside the fields it
 * applies to.
 */
export interface IFeedSpec extends IConsumerSpec {
    /** How many records may be in flight at once. One (the default) orders commits for free. */
    concurrency?: number;
    /** The commit timetable, or a plain count. Defaults to `{every: 100, ms: 1000}`. */
    commit?: number | ICommitPolicy;
    /** How often one record is tried before it is dead-lettered. Defaults to 3. */
    attempts?: number;
    /** The logical topic a failed record is produced to, after its last attempt. */
    deadLetter?: string;
}

export const DEFAULT_CONCURRENCY = 1;
export const DEFAULT_ATTEMPTS = 3;
export const DEFAULT_COMMIT: Required<ICommitPolicy> = {every: 100, ms: 1_000};

/** The kinds a client setting may take, as librdkafka reads its own config. */
type SettingKind = 'string' | 'number' | 'boolean';

/**
 * The settings both clients take.
 *
 * librdkafka ignores a key it does not know, so a misspelt `acks` silently leaves the default —
 * which is why the table is the check and not a convenience (`@@D-1035`).
 */
const COMMON_CONFIG_KIND: Record<string, SettingKind> = {
    'api.version.request': 'boolean',
    'broker.address.family': 'string',
    'client.rack': 'string',
    debug: 'string',
    'enable.random.seed': 'boolean',
    'log.connection.close': 'boolean',
    log_level: 'number',
    'metadata.max.age.ms': 'number',
    'reconnect.backoff.max.ms': 'number',
    'reconnect.backoff.ms': 'number',
    'socket.keepalive.enable': 'boolean',
    'socket.timeout.ms': 'number',
    'statistics.interval.ms': 'number',
    'topic.metadata.refresh.fast.interval.ms': 'number',
    'topic.metadata.refresh.interval.ms': 'number',
    'topic.metadata.refresh.sparse': 'boolean',
};

const PRODUCER_CONFIG_KIND: Record<string, SettingKind> = {
    ...COMMON_CONFIG_KIND,
    acks: 'string',
    'batch.num.messages': 'number',
    'batch.size': 'number',
    'compression.codec': 'string',
    'compression.level': 'number',
    'delivery.report.only.error': 'boolean',
    'enable.idempotence': 'boolean',
    'linger.ms': 'number',
    'message.send.max.retries': 'number',
    'message.timeout.ms': 'number',
    partitioner: 'string',
    'queue.buffering.backpressure.threshold': 'number',
    'queue.buffering.max.kbytes': 'number',
    'queue.buffering.max.messages': 'number',
    'queue.buffering.max.ms': 'number',
    'queue.buffering.timeout.ms': 'number',
    'request.required.acks': 'string',
    'request.timeout.ms': 'number',
    'retry.backoff.ms': 'number',
    'sticky.partitioning.linger.ms': 'number',
    'transactional.id': 'string',
};

const CONSUMER_CONFIG_KIND: Record<string, SettingKind> = {
    ...COMMON_CONFIG_KIND,
    'allow.auto.create.topics': 'boolean',
    'auto.commit.enable': 'boolean',
    'auto.commit.interval.ms': 'number',
    'auto.offset.reset': 'string',
    'check.crcs': 'boolean',
    'enable.auto.commit': 'boolean',
    'enable.auto.offset.store': 'boolean',
    'enable.partition.eof': 'boolean',
    'fetch.error.backoff.ms': 'number',
    'fetch.max.bytes': 'number',
    'fetch.message.max.bytes': 'number',
    'fetch.min.bytes': 'number',
    'fetch.queue.backoff.ms': 'number',
    'fetch.wait.max.ms': 'number',
    'group.instance.id': 'string',
    'heartbeat.interval.ms': 'number',
    'isolation.level': 'string',
    'max.poll.interval.ms': 'number',
    'queued.max.messages.kbytes': 'number',
    'queued.min.messages': 'number',
    'session.timeout.ms': 'number',
};

/**
 * One client's settings, checked (`@@D-1035`).
 *
 * A name outside the table is refused rather than passed on, for the same reason a topic's config
 * is (`@@D-1034`): the client would accept it and ignore it. `group.id` is refused outright in a
 * consumer's config, because `groupId` owns that name — and it is the one value that carries the
 * tenant, so a second spelling of it would be a second, unmapped group.
 */
export function clientConfigOf<T>(
    kind: 'producer' | 'consumer',
    value: unknown,
    source: string,
): T {
    if (value === undefined || value === null) return {} as T;
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${source}: a ${kind}'s config is a map of librdkafka settings`);
    }
    const table = kind === 'producer' ? PRODUCER_CONFIG_KIND : CONSUMER_CONFIG_KIND;
    const result: Record<string, unknown> = {};
    for (const [name, setting] of Object.entries(value as Record<string, unknown>)) {
        if (kind === 'consumer' && name === 'group.id') {
            throw new Error(
                `${source}: "group.id" is written as "groupId" on the spec — the one value that carries the tenant`,
            );
        }
        const settingKind = table[name];
        if (!settingKind)
            throw new Error(`${source}: "${name}" is not a librdkafka ${kind} setting`);
        if (typeof setting !== settingKind) {
            throw new Error(`${source}: "${name}" is a ${settingKind}`);
        }
        result[name] = setting;
    }
    return result as T;
}

/** One producer spec, checked (`@@D-1035`). */
export function producerSpecOf(value: unknown, source: string): IProducerSpec {
    const spec = (value ?? {}) as Record<string, unknown>;
    if (typeof spec !== 'object' || Array.isArray(spec)) {
        throw new Error(`${source}: a producer is declared with its settings, or with nothing`);
    }
    checkPatterns(spec.topics, source);
    if (spec.eager !== undefined && typeof spec.eager !== 'boolean') {
        throw new Error(`${source}: "eager" is true or false`);
    }
    if (spec.transactionalId !== undefined && typeof spec.transactionalId !== 'string') {
        throw new Error(`${source}: "transactionalId" is a string`);
    }
    return {
        ...(Array.isArray(spec.topics) && {topics: spec.topics as string[]}),
        ...(typeof spec.eager === 'boolean' && {eager: spec.eager}),
        ...(typeof spec.transactionalId === 'string' && {transactionalId: spec.transactionalId}),
        config: clientConfigOf<KafkaProducerConfig>('producer', spec.config, source),
    };
}

/** One consumer spec, checked (`@@D-1035`). */
export function consumerSpecOf(value: unknown, source: string): IConsumerSpec {
    const spec = (value ?? {}) as Record<string, unknown>;
    if (typeof spec !== 'object' || Array.isArray(spec)) {
        throw new Error(`${source}: a consumer is declared with its settings, or with nothing`);
    }
    checkPatterns(spec.topics, source);
    if (spec.groupId !== undefined && typeof spec.groupId !== 'string') {
        throw new Error(`${source}: "groupId" is a string`);
    }
    if (spec.assign !== undefined && typeof spec.assign !== 'boolean') {
        throw new Error(`${source}: "assign" is true or false`);
    }
    return {
        ...(Array.isArray(spec.topics) && {topics: spec.topics as string[]}),
        ...(typeof spec.groupId === 'string' && {groupId: spec.groupId}),
        ...(typeof spec.assign === 'boolean' && {assign: spec.assign}),
        config: clientConfigOf<KafkaTopicConfig>('consumer', spec.config, source),
    };
}

/** One feed spec, checked (`@@D-1036`). */
export function feedSpecOf(value: unknown, source: string): IFeedSpec {
    const spec = consumerSpecOf(value, source) as IFeedSpec;
    const raw = (value ?? {}) as Record<string, unknown>;
    if (raw.concurrency !== undefined) {
        const concurrency = Number(raw.concurrency);
        if (!Number.isInteger(concurrency) || concurrency < 1) {
            throw new Error(`${source}: "concurrency" is a whole number of at least one`);
        }
        spec.concurrency = concurrency;
    }
    if (raw.attempts !== undefined) {
        const attempts = Number(raw.attempts);
        if (!Number.isInteger(attempts) || attempts < 1) {
            throw new Error(`${source}: "attempts" is a whole number of at least one`);
        }
        spec.attempts = attempts;
    }
    if (raw.deadLetter !== undefined) {
        if (typeof raw.deadLetter !== 'string' || !raw.deadLetter) {
            throw new Error(`${source}: "deadLetter" is the logical name of a declared topic`);
        }
        spec.deadLetter = raw.deadLetter;
    }
    if (raw.commit !== undefined) spec.commit = commitPolicyOf(raw.commit, source);
    // The two settings a feed owns, because they are the difference between a record that was read
    // and one that was processed (`@@D-1036`): a spec that asks for them is refused rather than
    // quietly overridden.
    for (const name of ['enable.auto.commit', 'enable.auto.offset.store']) {
        if ((spec.config as Record<string, unknown>)[name] === true) {
            throw new Error(
                `${source}: "${name}" is off for a feed — its commits are the ones it makes after a record is processed`,
            );
        }
    }
    return spec;
}

/** A commit timetable, however the spec wrote it (`@@D-1036`). */
export function commitPolicyOf(value: unknown, source: string): ICommitPolicy {
    if (typeof value === 'number') {
        if (!Number.isInteger(value) || value < 1) {
            throw new Error(`${source}: "commit" as a number is a whole count of at least one`);
        }
        return {every: value};
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${source}: "commit" is a count, or {every, ms}`);
    }
    const policy = value as {every?: unknown; ms?: unknown};
    const result: ICommitPolicy = {};
    for (const name of ['every', 'ms'] as const) {
        const entry = policy[name];
        if (entry === undefined) continue;
        const number = Number(entry);
        if (!Number.isInteger(number) || number < 1) {
            throw new Error(`${source}: "commit.${name}" is a whole number of at least one`);
        }
        result[name] = number;
    }
    return result;
}

function checkPatterns(value: unknown, source: string): void {
    if (value === undefined) return;
    if (!Array.isArray(value) || value.some(entry => typeof entry !== 'string') || !value.length) {
        throw new Error(`${source}: "topics" is a non-empty list of topic patterns`);
    }
}

/**
 * Whether a topic pattern names a logical topic.
 *
 * `*` is any run of characters and `?` one of them; everything else is taken literally, dots
 * included. A topic's own dots are part of its name, so a pattern that means "every agent topic"
 * writes `blong.agent.*`.
 */
export function patternMatches(pattern: string, topic: string): boolean {
    const source = pattern
        .split('')
        .map(character =>
            character === '*'
                ? '.*'
                : character === '?'
                  ? '.'
                  : character.replace(/[.+^${}()|[\]\\]/g, '\\$&'),
        )
        .join('');
    return new RegExp(`^${source}$`).test(topic);
}

/** The spec a map holds for a topic: the first matching pattern, else `default`. */
export interface ISpecMatch<T> {
    alias: string;
    spec: T;
}

/**
 * The spec that carries a topic (`@@D-1035`).
 *
 * Patterns decide first, in the order they are written, so a broad `blong.*` does not swallow the
 * one topic a narrower spec names later; `default` answers for everything no pattern claimed. A map
 * of exactly one spec needs no `default`: there is only one answer it could give.
 */
export function matchSpec<T extends {topics?: string[]}>(
    map: Record<string, T>,
    topic: string,
    kind: 'producer' | 'consumer' | 'feed',
    options: {single?: boolean} = {},
): ISpecMatch<T> {
    let fallback: ISpecMatch<T> | undefined;
    for (const [alias, spec] of Object.entries(map)) {
        if (spec.topics?.some(pattern => patternMatches(pattern, topic))) return {alias, spec};
        if (alias === 'default') fallback = {alias, spec};
    }
    if (fallback) return fallback;
    const aliases = Object.keys(map);
    // A map of one spec needs no `default` when a client is *needed*, but an operator asking what
    // carries a topic is asking for the truth rather than the only candidate there is.
    if (options.single !== false && aliases.length === 1) {
        return {alias: aliases[0], spec: map[aliases[0]]};
    }
    const named = aliases.length ? aliases.map(alias => `"${alias}"`).join(', ') : 'none';
    throw new Error(
        `No kafka ${kind} carries the topic ${topic}: patterns name ${named}, and there is no "default"`,
    );
}

/** The consumer specs an instance has, including the one its legacy `consume` block implies. */
export function consumerSpecsOf(config: {
    consumer?: Record<string, IConsumerSpec>;
    consume?: {topics?: string[]; groupId?: string};
}): Record<string, IConsumerSpec> {
    if (config.consumer && Object.keys(config.consumer).length) return config.consumer;
    const topics = config.consume?.topics ?? [];
    return {
        default: {
            ...(topics.length && {topics: [...topics]}),
            ...(config.consume?.groupId && {groupId: config.consume.groupId}),
        },
    };
}

/** The producers an instance has. An untouched instance needs one, so the map may be absent. */
export function producerSpecsOf(config: {
    producer?: Record<string, IProducerSpec>;
}): Record<string, IProducerSpec> {
    return config.producer && Object.keys(config.producer).length ? config.producer : {default: {}};
}

/** What `client.list` answers for one alias (`@@D-1035`). */
export interface IClientSummary {
    kind: 'producer' | 'consumer' | 'feed';
    alias: string;
    topics: string[];
    groupId?: string;
    assign?: boolean;
    eager?: boolean;
    concurrency?: number;
    deadLetter?: string;
}
