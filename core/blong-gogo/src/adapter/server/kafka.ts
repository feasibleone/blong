/**
 * The Kafka adapter — produce, consume, topics, and the feeds a realm runs in the background.
 *
 * The adapter itself is the wiring: one connection, the client maps a topic picks a client from
 * (`@@D-1035`), the topics realms declare (`@@D-1001`), and the operations `exec` answers. The
 * mechanics live beside it in `kafka/`: `clients` (the shapes and the waits), `names` (logical and
 * physical names, `@@D-1003`), `topics` (a topic's shape and settings, `@@D-1034`), `declarations`
 * (the YAML a realm ships, `@@D-1001`), `produce`/`consume` (one record each way), and `feed`
 * (a subscription put to work, `@@D-1036`).
 */
import {adapter, type IMeta} from '@feasibleone/blong/types';
import Kafka from 'node-rdkafka';
import {Duplex} from 'stream';

import {
    freshGroup,
    type IKafkaClients,
    type IKafkaHeader,
    type IKafkaProducer,
    type KafkaConfig,
    type KafkaProducerConfig,
    messageOf,
    nodeRdkafkaClients,
    whenReady,
} from '../impl/kafka/clients.ts';
import {
    consumerSpecOf,
    DEFAULT_CONCURRENCY,
    feedSpecOf,
    type IClientSummary,
    type IConsumerSpec,
    type IFeedSpec,
    type IProducerSpec,
    matchSpec,
    producerSpecOf,
} from '../impl/kafka/config.ts';
import {readTopicMessages, startsOf, topicWatch} from '../impl/kafka/consume.ts';
import {
    declaredTopicsOf,
    type IResolvedTopic,
    type ITopicProvisionContext,
    provisionOf,
} from '../impl/kafka/declarations.ts';
import {type IFeedHandle, openFeed} from '../impl/kafka/feed.ts';
import {
    brokerTopicOf,
    claimTopic,
    logicalRecordOf,
    physicalGroupOf,
    physicalTopicOf,
    topicNamespace,
} from '../impl/kafka/names.ts';
import {messageSend, reportProducerConfig} from '../impl/kafka/produce.ts';
import {topicConfigOf, topicCreate, topicOffsets} from '../impl/kafka/topics.ts';

type CodecInstance = {
    encode: (...args: unknown[]) => Promise<string | Buffer<ArrayBufferLike>>;
    /** One answer, or a list of them — the stream type decides which a codec writes. */
    decode: (...args: unknown[]) => Promise<object | object[]>;
};

export interface IConfig {
    connection: KafkaConfig;
    /**
     * The topic set a stream instance reads, and the group it reads it under.
     *
     * The legacy spelling of one `consumer` spec: an instance that writes `consume` and no
     * `consumer` map gets a `default` consumer from these two fields, so every realm that predates
     * the client maps keeps working unchanged (`@@D-1035`).
     */
    consume?: {
        topics?: string[];
        groupId?: string;
    };
    codec?: {
        new (config: object): CodecInstance;
    };
    /**
     * Operation mode.
     * - `'stream'` (default): a produce/consume message adapter — every triple
     *   is routed through the Kafka stream (the request is encoded and produced
     *   to the stream's topics, the response is consumed + decoded).
     * - `'admin'`: an introspection adapter — triples are routed to `exec`
     *   (like the API adapters: `super.connect()` → `handle()` → `exec`), so
     *   `{ns}.topic.*` (metadata, offsets, create, watch), `{ns}.message.send`,
     *   `{ns}.client.list` and `{ns}.topic.resolve` are reachable. No produce/consume stream,
     *   though its feeds still run.
     */
    mode?: 'stream' | 'admin';
    /**
     * The first segment of every topic this instance may touch (`@@D-990`). Defaults to `blong`,
     * which makes a topic `blong.<namespace>.<feed>`.
     */
    topicPrefix?: string;
    /**
     * The namespace a topic carries, when it is not the one this instance answers calls under.
     *
     * A realm's instance is reached as `kafka.topic.watch` — the port serves the name its file has —
     * while the feed it publishes belongs to the realm: `topicNamespace: agent` is what makes its
     * topics `blong.agent.*` and keeps every other realm's names out of reach (`@@D-990`).
     */
    topicNamespace?: string;
    /**
     * The tenant this instance publishes under, which prefixes every topic and group it touches
     * (`@@D-1003`).
     *
     * A broker shared by several environments — a developer's cluster, two tenants on one broker —
     * needs a name per environment, the way the database adapter derives a database name in `dev`.
     * The base adapter's `dev` block derives this from the user name; every other intent leaves it
     * unset, so a deployment addresses the names its own broker holds. `physical:<name>` names a
     * topic on the broker that carries no tenant at all.
     */
    tenant?: string;
    /**
     * Admit a topic that carries no realm namespace.
     *
     * The escape for a broker and a topic that belong to no realm — the integration package's
     * `blong-integration`, the commander's explorer (`@@T-785`).
     */
    allowForeignTopic?: boolean;
    /**
     * What the start does with the topics the realms declare, in their `meta/kafka/*.yaml`
     * (`@@D-1001`).
     *
     * Absent, the declarations are read by nothing — which is the shape a planning run wants,
     * because it has no broker to ask. The realms that own a topic declare it there; this block is
     * the process's policy for them, and it belongs in the intent blocks that provision (`dev`, and
     * the `upgrade` Job a deployment runs) rather than in `default`.
     */
    topics?: {
        /** Create a declared topic the broker does not have. Idempotent per declaration. */
        create?: boolean;
        /**
         * Refuse the start when a declaration carrying `required: true` is not observed present
         * afterwards. An unreachable broker counts as absent, so a provisioning run that could not
         * reach Kafka fails where an operator can see it rather than at the first produce.
         * Defaults to `true`.
         */
        failOnMissing?: boolean;
    };
    /**
     * The producers this instance may bring up, by alias (`@@D-1035`).
     *
     * A logical topic picks one by the `topics` patterns its spec writes, and the spec named
     * `default` answers for the rest. Absent, the instance has one producer made from `connection`.
     */
    producer?: Record<string, IProducerSpec>;
    /**
     * The consumers this instance may bring up, by alias (`@@D-1035`).
     *
     * The read operations and the stream instance pick one the same way the producers are picked.
     * Absent, the instance has a `default` consumer made from its legacy `consume` block.
     */
    consumer?: Record<string, IConsumerSpec>;
    /**
     * The background feeds this instance runs (`@@D-1036`).
     *
     * Each is a subscription put to work: one consumer group, one topic set, and the policy for
     * commits, retries and dead letters. A record is decoded by the instance's codec — which is
     * what fills `$meta.method` — and dispatched like any other call.
     */
    feed?: Record<string, IFeedSpec>;
    /**
     * Where the clients come from (`@@T-782`).
     *
     * Absent in every deployment, which means `node-rdkafka`. A unit test supplies stand-ins so the
     * offset arithmetic and the delivery report are asserted without a cluster.
     */
    clientFactory?: IKafkaClients;
}

/** The config `exec` and the helpers read, plus what the loader merged in. */
type ResolvedConfig = IConfig & {namespace?: string | string[]; id?: string};

/** The specs an instance runs with, validated once at `start()` (`@@D-1035`). */
interface IClientMaps {
    producer: Record<string, IProducerSpec>;
    consumer: Record<string, IConsumerSpec>;
    feed: Record<string, IFeedSpec>;
}

/** One spec map, each entry checked with the file-less name a config block has. */
const checkedMap = <T>(raw: unknown, kind: 'producer' | 'consumer' | 'feed'): Record<string, T> => {
    if (raw === undefined || raw === null) return {};
    if (typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`kafka: "${kind}" is a map keyed by alias`);
    }
    const parse =
        kind === 'producer' ? producerSpecOf : kind === 'consumer' ? consumerSpecOf : feedSpecOf;
    return Object.fromEntries(
        Object.entries(raw as Record<string, unknown>).map(([alias, spec]) => [
            alias,
            parse(spec, `kafka ${kind} "${alias}"`),
        ]),
    ) as Record<string, T>;
};

/** The consumer specs an instance has, the legacy `consume` block standing in for `default`. */
const consumerMapsOf = (config: ResolvedConfig): Record<string, IConsumerSpec> => {
    const declared = checkedMap<IConsumerSpec>(config.consumer, 'consumer');
    if (Object.keys(declared).length) return declared;
    return {
        default: {
            ...(config.consume?.topics?.length && {topics: [...config.consume.topics]}),
            ...(config.consume?.groupId && {groupId: config.consume.groupId}),
        },
    };
};

/** The producer specs an instance has. A plain instance has exactly one, made from `connection`. */
const producerMapsOf = (config: ResolvedConfig): Record<string, IProducerSpec> => {
    const declared = checkedMap<IProducerSpec>(config.producer, 'producer');
    return Object.keys(declared).length ? declared : {default: {}};
};

/** The consumer a stream instance reads through: the `default` one, or the only one. */
const streamConsumerOf = (consumers: Record<string, IConsumerSpec>): IConsumerSpec => {
    const named = consumers.default ?? Object.values(consumers)[0];
    if (!named || Object.keys(consumers).length > 1) {
        throw new Error(
            'A kafka stream instance reads through one consumer spec named "default" (or the only one declared)',
        );
    }
    return named;
};

/** The spec a topic picks, without throwing when nothing claims it (`@@D-1035`). */
const matchOrUndefined = <T extends {topics?: string[]}>(
    map: Record<string, T>,
    topic: string,
    kind: 'producer' | 'consumer' | 'feed',
): {alias: string; spec: T} | undefined => {
    try {
        return matchSpec(map, topic, kind, {single: false});
    } catch {
        return undefined;
    }
};

/** The headers a caller may write on `message.send`. */
const headersOf = (value: unknown): IKafkaHeader[] | undefined => {
    if (value === undefined || value === null) return undefined;
    if (!Array.isArray(value)) {
        throw new Error('Missing headers param: a list of {name, value} headers');
    }
    return value.map((entry, position) => {
        const header = (entry ?? {}) as {name?: unknown; value?: unknown};
        if (typeof header.name !== 'string' || !header.name) {
            throw new Error(`Invalid header ${position + 1}: it has no "name"`);
        }
        return {name: header.name, value: Buffer.from(String(header.value ?? ''))};
    });
};

export * from '../impl/kafka/index.ts';

export default adapter<IConfig>(() => {
    let stream: Duplex | null = null;
    let codec: CodecInstance | null = null;
    let producerStream: ReturnType<typeof Kafka.Producer.createWriteStream> | null = null;
    let consumerStream:
        | (ReturnType<typeof Kafka.KafkaConsumer.createReadStream> & {
              consumer: {
                  isConnected(): boolean;
                  once(event: 'ready', cb: () => void): void;
                  assignments(): {partition: number; topic: string; offset: number}[];
                  getMetadata(
                      opts: {timeout: number},
                      cb: (
                          err: Error | null,
                          data?: {topics?: Array<{name: string; partitions: unknown[]}>},
                      ) => void,
                  ): void;
              };
          })
        | null = null;

    /** The producers made so far, by alias — one client per spec, kept until `stop()` (`@@D-1035`). */
    const producers = new Map<string, IKafkaProducer>();
    /** The feeds this instance is running (`@@D-1036`). */
    const feeds: IFeedHandle[] = [];
    let maps: IClientMaps = {producer: {default: {}}, consumer: {}, feed: {}};

    const clientsOf = (config: ResolvedConfig): IKafkaClients =>
        config.clientFactory ?? nodeRdkafkaClients;

    /**
     * The producer a logical topic is written with (`@@D-1035`).
     *
     * Made on first use and kept until `stop()`, because a producer is a connection to the broker
     * and a telemetry batch must not pay for one per message. `eager` opens it during `start()`
     * instead, so a deployment whose writes matter fails its migration step rather than its first
     * send.
     */
    const producerFor = async (
        config: ResolvedConfig,
        logicalTopic: string,
    ): Promise<{alias: string; spec: IProducerSpec; producer: IKafkaProducer}> => {
        const {alias, spec} = matchSpec(maps.producer, logicalTopic, 'producer');
        const existing = producers.get(alias);
        if (existing) return {alias, spec, producer: existing};
        const connection = {...config.connection, ...spec.config} as KafkaProducerConfig;
        const producer = clientsOf(config).producer(reportProducerConfig(connection));
        await whenReady(producer);
        producers.set(alias, producer);
        return {alias, spec, producer};
    };

    /**
     * Produce one record on the broker, naming the topic logically (`@@D-1003`).
     *
     * The writer of every answer, dead letter and explicit send: the producer map decides which
     * client carries the topic, and the tenant mapping decides what the broker is told.
     */
    const produceTo = async (
        config: ResolvedConfig,
        logicalTopic: string,
        message: {value: string; key?: string | null; partition?: number; headers?: IKafkaHeader[]},
    ): Promise<{topic: string; partition: number; offset: number}> => {
        const {spec, producer} = await producerFor(config, logicalTopic);
        const connection = {...config.connection, ...spec.config} as KafkaProducerConfig;
        const sent = await messageSend(
            clientsOf(config),
            connection,
            {
                topic: brokerTopicOf(config, logicalTopic),
                ...message,
            },
            {producer},
        );
        return {...sent, topic: logicalTopic};
    };

    /** Every client this instance could bring up, which is what `client.list` answers. */
    const clientSummaries = (): IClientSummary[] => [
        ...Object.entries(maps.producer).map(([alias, spec]) => ({
            kind: 'producer' as const,
            alias,
            topics: spec.topics ?? ['*'],
            ...(spec.eager !== undefined && {eager: spec.eager}),
            ...(spec.transactionalId && {transactionalId: spec.transactionalId}),
        })),
        ...Object.entries(maps.consumer).map(([alias, spec]) => ({
            kind: 'consumer' as const,
            alias,
            topics: spec.topics ?? [],
            ...(spec.groupId && {groupId: spec.groupId}),
            ...(spec.assign !== undefined && {assign: spec.assign}),
        })),
        ...Object.entries(maps.feed).map(([alias, spec]) => ({
            kind: 'feed' as const,
            alias,
            topics: spec.topics ?? [],
            ...(spec.groupId && {groupId: spec.groupId}),
            concurrency: spec.concurrency ?? DEFAULT_CONCURRENCY,
            ...(spec.deadLetter && {deadLetter: spec.deadLetter}),
        })),
    ];

    return {
        activation: {
            default: {
                type: 'kafka',
                connection: {
                    'client.id': 'blong',
                    'security.protocol': 'sasl_plaintext',
                    'sasl.mechanism': 'SCRAM-SHA-256',
                },
            },
            /**
             * A development process shares a broker with every other checkout on the machine, so
             * it publishes under the developer's own name and provisions its topics best-effort: a
             * laptop with no broker still starts (`@@D-1001` `@@D-1003`). An instance that reads
             * the broker rather than a realm's feed — an explorer — overrides `tenant` to `''`,
             * because it names the topics it was shown by `topic.list`.
             */
            dev: {tenant: '${user}', topics: {create: true, failOnMissing: false}},
            /**
             * A test run provisions what it can and does not die over it: the same best-effort
             * shape as `dev`, without the tenant — a suite's records are the suite's own, and a
             * machine with no broker still runs the groups that never touch one (`@@D-1001`).
             */
            integration: {topics: {create: true, failOnMissing: false}},
            /**
             * The step a deployment runs: the migration Job. A topic it cannot make, or a broker
             * it cannot reach, fails the Job where an operator reads it — so the refusal stays on
             * (`@@D-1001`).
             */
            upgrade: {topics: {create: true}},
        },

        async start() {
            const result = await super.start();
            const config = this.config as unknown as ResolvedConfig;
            const isAdmin = config.mode === 'admin';

            // The client maps, checked before anything is opened: a misspelt setting is refused
            // here, with the alias, rather than silently left at its default by librdkafka
            // (`@@D-1035`).
            maps = {
                producer: producerMapsOf(config),
                consumer: consumerMapsOf(config),
                feed: checkedMap<IFeedSpec>(config.feed, 'feed'),
            };
            for (const [alias, spec] of Object.entries(maps.producer)) {
                if (spec.transactionalId) {
                    // Reserved, not written: a spec that names it must not believe it has
                    // atomicity it does not have (`@@T-843`).
                    throw new Error(
                        `kafka producer "${alias}" sets transactionalId, and transactions are not implemented yet`,
                    );
                }
            }
            if (Object.keys(maps.feed).length && !config.codec) {
                throw new Error(
                    'kafka feeds dispatch their records through the instance codec, so a codec is required',
                );
            }

            // The codec encodes/decodes the Kafka stream message format. Admin (introspection)
            // mode routes triples to `exec`, so the codec is not applied there — a stream codec
            // would try `msg.value.toString()` on the exec result. An admin instance still keeps
            // the codec for its feeds, which decode records with it.
            if (config.codec) {
                codec = new config.codec({});
                if (!isAdmin) {
                    this.encode = (...params) => codec!.encode(...params);
                    /**
                     * A stream codec writes one answer for one message, while the port types
                     * `decode` as a list — a codec that answers many at once fills one. The wrapper
                     * keeps the codec's own shape, because the frames are what the caller reads,
                     * and only makes the answer speak the logical topic it was asked about
                     * (`@@D-1003`).
                     */
                    this.decode = (async (...params: unknown[]) => {
                        const decoded = await codec!.decode(...params);
                        return Array.isArray(decoded)
                            ? decoded.map(entry => logicalRecordOf(config, entry))
                            : logicalRecordOf(config, decoded);
                    }) as unknown as typeof this.decode;
                }
            } else {
                codec = null;
            }

            // The topics the realms declare (`@@D-1001`), provisioned before anything reads one:
            // a stream instance subscribes below, and a consumer subscribed to a topic the broker
            // does not have is never assigned a partition, so provisioning after `ready` would come
            // too late to be the reason it works.
            if (config.topics) {
                const declarations = await declaredTopicsOf({
                    attach: this.attach ? this.attach.bind(this) : undefined,
                    platform: this.platform!,
                });
                const outcomes = await provisionOf(
                    config as ITopicProvisionContext['config'],
                    declarations,
                    this.signal,
                );
                // Resolution is made visible rather than left to inference: every declared topic
                // says which producer and which consumer carry it (`@@D-1035`).
                for (const declaration of declarations) {
                    const outcome = outcomes.find(entry => entry.topic === declaration.topic);
                    if (!outcome || outcome.skipped) continue;
                    this.signal?.frameworkKafkaTopicResolved?.({
                        topic: outcome.topic,
                        physical: outcome.physical,
                        producer: matchOrUndefined(maps.producer, outcome.topic, 'producer')?.alias,
                        consumer: matchOrUndefined(maps.consumer, outcome.topic, 'consumer')?.alias,
                        feed: matchOrUndefined(maps.feed, outcome.topic, 'feed')?.alias,
                    });
                }
            }

            if (isAdmin) {
                // An admin instance holds no group and no read stream: every operation it answers
                // makes its own client and closes it, so a realm can attach this adapter before a
                // broker exists — and a process that never reads a topic never joins one
                // (`@@D-1000`).
                super.connect();
            } else {
                const consumerSpec = streamConsumerOf(maps.consumer);
                const groupId = physicalGroupOf(
                    config,
                    consumerSpec.groupId ?? config.consume?.groupId ?? `blong.stream`,
                );
                const startedAt = Date.now();
                // The topics a stream instance reads are logical names in the config and physical
                // ones at the broker, like every other name this adapter is handed (`@@D-1003`).
                const consumeTopics = (consumerSpec.topics ?? []).map(topic =>
                    brokerTopicOf(config, topic),
                );
                const consumerConfig = {
                    ...config.connection,
                    ...consumerSpec.config,
                    'group.id': groupId,
                };
                this.signal?.frameworkKafkaConsumerCreating?.({
                    groupId,
                    topics: consumeTopics,
                    sessionTimeoutMs: consumerConfig['session.timeout.ms'],
                    broker: consumerConfig['metadata.broker.list'],
                });

                consumerStream = Kafka.KafkaConsumer.createReadStream(
                    consumerConfig,
                    {
                        'auto.offset.reset': 'earliest',
                    },
                    {topics: consumeTopics},
                ) as typeof consumerStream;

                // Wait for consumer to connect and receive partition assignments.
                // node-rdkafka group rebalance can take up to a few seconds after 'ready'.
                await new Promise<void>((resolve, reject) => {
                    let poll: ReturnType<typeof setInterval> | null = null;
                    let safety: ReturnType<typeof setTimeout> | null = null;
                    const cleanup = () => {
                        if (poll) clearInterval(poll);
                        if (safety) clearTimeout(safety);
                        poll = null;
                        safety = null;
                    };
                    const startPolling = () => {
                        poll = setInterval(() => {
                            if (consumerStream!.consumer.assignments().length > 0) {
                                cleanup();
                                this.signal?.frameworkKafkaConsumerAssigned?.({
                                    groupId,
                                    elapsedMs: Date.now() - startedAt,
                                });
                                resolve();
                            }
                        }, 200);
                        safety = setTimeout(() => {
                            cleanup();
                            this.signal?.frameworkKafkaAssignmentTimedOut?.({
                                groupId,
                                elapsedMs: Date.now() - startedAt,
                                hint: 'stale group members from an earlier abrupt shutdown keep the rebalance waiting up to session.timeout.ms',
                            });
                            // Best-effort graceful close BEFORE failing start: a consumer that
                            // joined the group but never got an assignment would otherwise linger
                            // as a stale group member (no LeaveGroup), blocking the NEXT rebalance
                            // for up to session.timeout.ms too. destroy() → close() → disconnect()
                            // sends LeaveGroup.
                            try {
                                consumerStream?.destroy();
                            } catch {
                                // ignore — the process is already failing start
                            }
                            reject(new Error('Kafka assignment timeout'));
                        }, 30000);
                    };
                    if (consumerStream!.consumer.isConnected()) {
                        this.signal?.frameworkKafkaConsumerConnected?.({groupId});
                        startPolling();
                    } else {
                        this.signal?.frameworkKafkaConsumerConnecting?.({groupId});
                        consumerStream!.consumer.once('ready', () => {
                            this.signal?.frameworkKafkaConsumerReady?.({
                                groupId,
                                elapsedMs: Date.now() - startedAt,
                            });
                            startPolling();
                        });
                    }
                });

                {
                    producerStream = Kafka.Producer.createWriteStream(
                        {
                            ...config.connection,
                        },
                        {},
                        {
                            objectMode: true,
                        },
                    );

                    // Build a custom Duplex that writes to the Kafka producer and
                    // receives messages from the Kafka consumer via 'data' events.
                    // Duplex.from({readable, writable}) is not used because it does
                    // not reliably forward object-mode events from the inner readable.
                    stream = new Duplex({objectMode: true, read() {}});
                    stream.write = (chunk, ...args) => {
                        // A codec names the topic it encoded for — the logical name, or the one the
                        // caller put in the payload — and the producer has to be handed the
                        // broker's (`@@D-1003`). A chunk that names none is passed on untouched:
                        // the client's own error for it names the omission better than this would.
                        const message = (chunk ?? {}) as {topic?: unknown};
                        const named =
                            typeof message.topic === 'string' && message.topic
                                ? {...message, topic: brokerTopicOf(config, message.topic)}
                                : chunk;
                        return (producerStream!.write as (...a: unknown[]) => boolean)(
                            named,
                            ...args,
                        );
                    };

                    consumerStream!.on('data', msg => stream?.push(msg));
                    consumerStream!.on('end', () => stream?.push(null));
                    consumerStream!.on('error', err => stream?.destroy(err as Error));

                    super.connect(stream);
                }
            }

            // The producers a spec marked `eager` are opened now, so a deployment that must write
            // fails its migration step rather than its first message (`@@D-1035`).
            for (const spec of Object.values(maps.producer)) {
                if (!spec.eager) continue;
                const logical = spec.topics?.find(pattern => !/[*?]/.test(pattern));
                await producerFor(config, logical ?? `${topicNamespace(config, '')}eager`);
            }

            // The feeds, one loop each (`@@D-1036`). A feed is a subscription rather than a
            // request/response exchange, so it runs over its own consumer and its own loop, and a
            // stream instance keeps its matching loop beside them.
            for (const [alias, spec] of Object.entries(maps.feed)) {
                if (spec.assign) {
                    throw new Error(
                        `kafka feed "${alias}" sets assign, and a feed is a group subscription — use a "consumer" spec for a reader that assigns`,
                    );
                }
                feeds.push(
                    await openFeed({
                        alias,
                        spec,
                        config,
                        clients: clientsOf(config),
                        connection: config.connection,
                        signal: this.signal,
                        produce: (topic, message) => produceTo(config, topic, message),
                        decode: (frame, meta) => codec!.decode(frame, meta),
                        encode: async (value, meta) => codec!.encode(value, meta),
                        connect: (feedStream, afterDispatch, decode) =>
                            this.connect?.(feedStream, undefined, {
                                outbound: false,
                                afterDispatch,
                                decode,
                            }),
                    }),
                );
            }

            return result;
        },

        async stop(...params: unknown[]) {
            // The feeds first: each flushes the work it has done before its client goes, so a
            // graceful stop loses nothing (`@@D-1036`).
            for (const feed of feeds.splice(0)) {
                try {
                    await feed.stop();
                } catch (error) {
                    this.signal?.frameworkKafkaFeedCommitFailed?.({
                        feed: feed.alias,
                        error: messageOf(error),
                    });
                }
            }
            // Every producer the instance opened: flushed, then closed. The shared producer this
            // adapter used to keep was closed without a flush (`@@D-1035`).
            for (const producer of producers.values()) {
                try {
                    producer.flush(5_000);
                } catch {
                    // The queue has already been answered; a busy queue changes nothing.
                }
                try {
                    producer.disconnect();
                } catch {
                    // A producer that never connected has nothing to leave behind.
                }
            }
            producers.clear();

            // The group the process joined, spelled the way the broker has it (`@@D-1003`).
            const config = this.config as unknown as ResolvedConfig;
            const streamGroup = maps.consumer.default ?? Object.values(maps.consumer)[0];
            const groupId = streamGroup?.groupId ?? config.consume?.groupId;
            const physicalGroup = groupId ? physicalGroupOf(config, groupId) : undefined;
            const stopStartedAt = Date.now();
            this.signal?.frameworkKafkaStop?.({groupId: physicalGroup});
            const awaitClose = (
                s: {once(e: 'close', cb: () => void): void} | null,
                disconnect: () => void,
                ms: number,
            ) =>
                !s
                    ? Promise.resolve()
                    : new Promise<void>(resolve => {
                          const t = setTimeout(() => {
                              this.signal?.frameworkKafkaCloseTimedOut?.({
                                  groupId: physicalGroup,
                                  waitMs: ms,
                                  elapsedMs: Date.now() - stopStartedAt,
                                  hint: 'consumer/producer did not emit close — the group member was not gracefully removed',
                              });
                              resolve();
                          }, ms);
                          s.once('close', () => {
                              clearTimeout(t);
                              this.signal?.frameworkKafkaClosed?.({
                                  groupId: physicalGroup,
                                  elapsedMs: Date.now() - stopStartedAt,
                              });
                              resolve();
                          });
                          disconnect();
                      });

            let result;
            try {
                stream?.destroy();
                // consumerStream.destroy() → close() → consumer.disconnect() → emits 'close'
                // producerStream.close()   →           producer.disconnect() → emits 'close'
                // Both must complete so rdkafka uv handles are released and the process exits.
                await Promise.all([
                    awaitClose(consumerStream, () => consumerStream?.destroy(), 20000),
                    awaitClose(
                        producerStream as unknown as Parameters<typeof awaitClose>[0],
                        () => (producerStream as unknown as {close(): void} | null)?.close(),
                        20000,
                    ),
                ]);
                this.signal?.frameworkKafkaStopComplete?.({
                    groupId: physicalGroup,
                    elapsedMs: Date.now() - stopStartedAt,
                });
            } finally {
                stream = null;
                codec = null;
                consumerStream = null;
                producerStream = null;
                maps = {producer: {default: {}}, consumer: {}, feed: {}};
                result = await super.stop(...params);
            }
            return result;
        },

        async exec(params: Record<string, unknown>, $meta: IMeta): Promise<unknown> {
            const {method} = $meta;
            const [, object, operation] = method!.split('.');
            const config = this.config as unknown as ResolvedConfig;
            const clients = clientsOf(config);
            const connection = config.connection;
            const namespaceHint = String(method ?? '').split('.')[0];
            /**
             * The names this call carries (`@@D-1003`): the logical one a realm declares and the
             * physical one the broker holds. The guard checks the logical name (`@@D-990`), every
             * broker call is made with the physical one, and an answer about the topic the caller
             * asked about names it logically.
             */
            const namesOf = (name: unknown): IResolvedTopic => {
                const logical = claimTopic(config, namespaceHint, name);
                return {logical, physical: physicalTopicOf(config, logical)};
            };
            /**
             * The connection a read of this topic makes its client with (`@@D-1035`).
             *
             * A read operation opens a consumer of its own — it joins no group and owns no
             * offset — but it is still the topic's consumer spec that says how that client is
             * configured, so one map answers for the stream, the feeds and the explorer alike.
             */
            const readConnectionOf = (logical: string): KafkaConfig => {
                const spec = matchOrUndefined(maps.consumer, logical, 'consumer')?.spec;
                return {...connection, ...spec?.config} as KafkaConfig;
            };
            if (object === 'client' && operation === 'list') {
                // `{ns}.client.list` — every client the instance could bring up, by alias
                // (`@@D-1035`). Resolution is visible rather than inferred from a name.
                return {items: clientSummaries()};
            }
            if (object === 'topic') {
                switch (operation) {
                    case 'list': {
                        // `{ns}.topic.list` — enumerate topics from broker metadata. The instance
                        // holds no consumer of its own, so the look makes one and closes it.
                        const consumer = clients.consumer(
                            {...connection, 'group.id': freshGroup('list')},
                            {'auto.offset.reset': 'earliest'},
                        );
                        try {
                            await whenReady(consumer);
                            const metadata = await new Promise<{
                                topics?: {name: string; partitions?: {id: number}[]}[];
                            }>((resolve, reject) =>
                                consumer.getMetadata(
                                    {timeout: 5_000, allTopics: true},
                                    (error, data) =>
                                        error
                                            ? reject(
                                                  new Error(
                                                      error.message ?? 'Kafka metadata unavailable',
                                                  ),
                                              )
                                            : resolve(data ?? {}),
                                ),
                            );
                            return {
                                items: (metadata.topics ?? [])
                                    .filter(t => !t.name.startsWith('__'))
                                    .map(t => ({
                                        topic: t.name,
                                        partitionCount: t.partitions?.length ?? 0,
                                    })),
                            };
                        } finally {
                            try {
                                consumer.disconnect();
                            } catch {
                                // A consumer that never connected has nothing to leave behind.
                            }
                        }
                    }
                    case 'resolve': {
                        // `{ns}.topic.resolve` — which producer and which consumer carry a topic
                        // (`@@D-1035`). The same question `start()` answers in its record.
                        const names = namesOf(params.topic);
                        return {
                            topic: names.logical,
                            physical: names.physical,
                            producer: matchOrUndefined(maps.producer, names.logical, 'producer')
                                ?.alias,
                            consumer: matchOrUndefined(maps.consumer, names.logical, 'consumer')
                                ?.alias,
                            feed: matchOrUndefined(maps.feed, names.logical, 'feed')?.alias,
                        };
                    }
                    case 'find': {
                        // `{ns}.topic.find` — read a batch of messages from a topic.
                        // A fresh consumer group with `auto.offset.reset: earliest`
                        // reads existing messages from the beginning (exploration);
                        // partitions are surfaced as message metadata, not tree nodes.
                        // The records speak the logical name, like every answer; `topic.list` is
                        // the one operation that reports the broker's own names (`@@D-1003`).
                        const names = namesOf(params.topic);
                        const limit = (params.limit as number) ?? 50;
                        const messages = await readTopicMessages(
                            clients,
                            readConnectionOf(names.logical),
                            names.physical,
                            limit,
                            this.signal,
                        );
                        return {
                            items: messages.map(m => ({
                                topic: names.logical,
                                partition: m.partition,
                                offset: m.offset,
                                key: m.key?.toString(),
                                value: m.value?.toString(),
                                timestamp: m.timestamp,
                            })),
                        };
                    }
                    case 'offsets': {
                        // `{ns}.topic.offsets` — the partitions and their watermarks, which is
                        // what a caller turns into "start at `high - tail` on every partition".
                        const names = namesOf(params.topic);
                        const answer = await topicOffsets(
                            clients,
                            readConnectionOf(names.logical),
                            names.physical,
                            {
                                timeoutMs: params.timeoutMs as number | undefined,
                                signal: this.signal,
                            },
                        );
                        return {...answer, topic: names.logical};
                    }
                    case 'create': {
                        // `{ns}.topic.create` — idempotent, because an integration run names the
                        // same topic on every start and auto-create gives it one partition. The
                        // config is the broker's own names, checked here rather than discovered as
                        // a setting the broker quietly ignored (`@@D-1034`).
                        const names = namesOf(params.topic);
                        const shape = await topicCreate(clients, connection, {
                            topic: names.physical,
                            partitions: params.partitions as number | undefined,
                            replicationFactor: params.replicationFactor as number | undefined,
                            config: topicConfigOf(params.config, String(method)),
                        });
                        return {...shape, topic: names.logical};
                    }
                    case 'watch': {
                        // `{ns}.topic.watch` — an async iterable, which the gateway streams: the
                        // op is a producer of frames, not an answer (`@@D-949`).
                        const names = namesOf(params.topic);
                        const records = topicWatch(clients, readConnectionOf(names.logical), {
                            topic: names.physical,
                            starts: startsOf(params.starts),
                            key: params.key as string | undefined,
                            $meta,
                        });
                        return (async function* () {
                            for await (const record of records) {
                                yield {...record, topic: names.logical};
                            }
                        })();
                    }
                }
            }
            if (object === 'message' && operation === 'send') {
                // `{ns}.message.send` — one message, and the partition and offset it landed at.
                //
                // The producer the topic resolves to is made once per alias and kept, because a
                // producer is a connection and a telemetry batch must not pay for one per message
                // (`@@D-1035`). `stop()` flushes and closes it with the streams.
                const names = namesOf(params.topic);
                const sent = await produceTo(config, names.logical, {
                    value:
                        typeof params.value === 'string'
                            ? params.value
                            : JSON.stringify(params.value ?? null),
                    key: params.key as string | null | undefined,
                    partition: params.partition as number | undefined,
                    headers: headersOf(params.headers),
                });
                return sent;
            }
            throw new Error(`Unknown kafka operation: ${object}.${operation}`);
        },
    };
});
