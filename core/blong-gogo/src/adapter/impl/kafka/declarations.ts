/**
 * The topics realms declare in `meta/kafka/*.yaml`, and the start that brings them to the shape
 * they asked for (`@@D-1001`).
 */
import type {VocabularyProxy} from '@feasibleone/blong/types';
import yaml from 'yaml';

import {
    type IKafkaClients,
    type IKafkaProducer,
    messageOf,
    nodeRdkafkaClients,
} from './clients.ts';
import {claimTopic, physicalTopicOf} from './names.ts';
import {messageSend, reportProducerConfig} from './produce.ts';
import {
    type ITopicConfig,
    type ITopicSpec,
    topicConfigOf,
    topicCreate,
    topicDescribe,
    topicHolds,
} from './topics.ts';

/**
 * A topic a realm declares, in its `meta/kafka/*.yaml` (`@@D-1001`).
 *
 * The declaration is the topic's whole shape and its obligation: `required` is what a start refuses
 * to lose, and `seed` is what a demo feed reads on a broker that has just been made. The names are
 * the realm's — the namespace guard is what keeps one realm's declarations out of another's.
 */
export interface ITopicDeclaration extends ITopicSpec {
    /**
     * The broker's name for this topic, when it is not the logical key under this instance's
     * tenant (`@@D-1003`).
     *
     * A declaration that writes it names the topic on the broker outright, whatever tenant the
     * process publishes under — the escape for a feed several environments must agree on the name
     * of. Without it the physical name is the key with the tenant in front of it, if there is one.
     */
    physical?: string;
    /** The start refuses to continue while this topic is absent (`topics.failOnMissing`). */
    required?: boolean;
    /** Rows to produce when the topic does not already hold them. */
    seed?: ITopicSeed[];
}

/** One message a declaration seeds. */
export interface ITopicSeed {
    key?: string;
    value: string;
}

/**
 * The fields a declaration writes for the adapter itself (`@@D-1034`).
 *
 * Every other key of an entry is the topic's config, in Kafka's own names and passed to the broker
 * unchanged; these five are lifted out first, so `physical` and `seed` never reach the topic config
 * a broker would refuse them in.
 */
const DECLARATION_FIELDS = new Set([
    'physical',
    'required',
    'seed',
    'partitions',
    'replicationFactor',
]);

/**
 * The declarations one asset file holds (`@@D-1001`).
 *
 * `topics` is a map keyed by topic name, so a second file — or a realm's own override merged over
 * it — changes one topic by writing that key rather than restating the whole list. A field a
 * declaration does not name is left out instead of defaulted, which is what makes the merge useful:
 * a later declaration of one topic replaces only the fields it writes. Everything except the
 * adapter's own fields (`@@D-1034`) is the topic's config, checked against the names and kinds a
 * broker accepts. Anything that is not a `topics` map is refused with the file it came from, because
 * a declaration that parsed into nothing would be a topic nobody provisions and the silence would
 * only be found by the read that wanted it.
 */
export function topicDeclarationsOf(document: unknown, source: string): ITopicDeclaration[] {
    const map = (document as {topics?: unknown} | null)?.topics;
    if (!map || typeof map !== 'object' || Array.isArray(map)) {
        throw new Error(`${source}: expected a "topics" map keyed by topic name`);
    }
    return Object.entries(map as Record<string, unknown>).map(([topic, raw]) => {
        const where = `${source}: topic ${topic}`;
        if (!topic) throw new Error(`${source}: a topic entry has no name`);
        if (raw !== null && raw !== undefined && typeof raw !== 'object') {
            throw new Error(`${where}: a topic is declared with its settings, or with nothing`);
        }
        const entry = (raw ?? {}) as Record<string, unknown>;
        const integer = (name: string): number | undefined => {
            const value = entry[name];
            if (value === undefined) return undefined;
            const number = Number(value);
            if (!Number.isInteger(number) || number < 0) {
                throw new Error(`${where}: "${name}" is a non-negative integer`);
            }
            return number;
        };
        if (entry.physical !== undefined && (typeof entry.physical !== 'string' || !entry.physical)) {
            throw new Error(`${where}: "physical" is the broker's own name for the topic`);
        }
        if (entry.seed !== undefined && !Array.isArray(entry.seed)) {
            throw new Error(`${where}: "seed" is a list of {key?, value} messages`);
        }
        const partitions = integer('partitions');
        const replicationFactor = integer('replicationFactor');
        const settings: Record<string, unknown> = {};
        for (const [name, value] of Object.entries(entry)) {
            if (!DECLARATION_FIELDS.has(name)) settings[name] = value;
        }
        const config = topicConfigOf(settings, where);
        const seed = ((entry.seed ?? []) as unknown[]).map((raw, position) => {
            const message = (raw ?? {}) as {key?: unknown; value?: unknown};
            if (typeof message.value !== 'string') {
                throw new Error(`${where}: seed ${position + 1} has no string "value"`);
            }
            return {
                key: typeof message.key === 'string' ? message.key : undefined,
                value: message.value,
            };
        });
        return {
            topic,
            ...(partitions !== undefined && {partitions}),
            ...(replicationFactor !== undefined && {replicationFactor}),
            ...(Object.keys(config).length > 0 && {config: config as ITopicConfig}),
            ...(typeof entry.physical === 'string' && {physical: entry.physical}),
            ...(entry.required === true && {required: true}),
            ...(seed.length > 0 && {seed}),
        };
    });
}

/** The two names a topic has: the one a realm declares, and the one the broker holds (`@@D-1003`). */
export interface IResolvedTopic {
    logical: string;
    physical: string;
}

/** What one declaration came to (`@@D-1001`). */
export interface ITopicOutcome {
    /** The name the realm declared. */
    topic: string;
    /** The name the broker holds, which carries the tenant when the instance has one. */
    physical: string;
    required: boolean;
    /** True when this call made the topic. */
    created: boolean;
    exists: boolean;
    partitions: number;
    /** False when the broker holds the topic with another partition count. */
    matches: boolean;
    /** How many seed messages this call produced. */
    seeded: number;
    /** Set when another instance owns the topic: the declaration is then that instance's work. */
    skipped?: string;
}

export interface ITopicProvisionOptions {
    /** Create a topic the broker does not have. */
    create?: boolean;
    /** Refuse when a `required` topic is not observed present afterwards. Defaults to `true`. */
    failOnMissing?: boolean;
    /**
     * The names a declared topic has, which is also where the namespace guard answers: it throws
     * for a topic another instance on the same broker owns. The declaration arrives whole, because
     * a name it writes is the declaration's own.
     */
    resolve: (declaration: ITopicDeclaration) => IResolvedTopic;
    timeoutMs?: number;
    signal?: VocabularyProxy;
}

/** The names a declaration resolves to, or the reason this instance leaves it alone. */
const resolveTopic = (
    options: ITopicProvisionOptions,
    declaration: ITopicDeclaration,
): IResolvedTopic | {skipped: string} => {
    try {
        return options.resolve(declaration);
    } catch (error) {
        return {skipped: messageOf(error)};
    }
};

/**
 * Bring the declared topics to the shape their realms asked for (`@@D-1001`).
 *
 * Each declaration is claimed through the namespace guard first, so an instance provisions its own
 * names and reports the ones another instance on the same broker owns. Creation is the idempotent
 * `topicCreate`, which reaches the broker's admin API only for a topic that is genuinely missing;
 * without `create` a declaration is only looked at. Seed rows are produced when the topic does not
 * already hold them, which is what makes a demo feed survive a broker that lost its volume without
 * appending a copy on every start.
 *
 * The whole set is walked before anything is refused, so a start reports every topic that is wrong
 * rather than the first one — and a `required` topic that is absent afterwards refuses the start
 * unless `failOnMissing` says otherwise.
 */
export async function topicProvision(
    clients: IKafkaClients,
    connection: Parameters<IKafkaClients['consumer']>[0],
    declarations: ITopicDeclaration[],
    options: ITopicProvisionOptions,
): Promise<ITopicOutcome[]> {
    const timeoutMs = options.timeoutMs ?? 5_000;
    const outcomes: ITopicOutcome[] = [];
    let producer: IKafkaProducer | null = null;
    try {
        for (const declaration of declarations) {
            const names = resolveTopic(options, declaration);
            if ('skipped' in names) {
                // Another instance's name: refusing it here would fail a process over a
                // declaration that instance is about to act on.
                options.signal?.frameworkKafkaTopicSkipped?.({
                    topic: declaration.topic,
                    reason: names.skipped,
                });
                outcomes.push({
                    topic: declaration.topic,
                    physical: declaration.topic,
                    required: false,
                    created: false,
                    exists: false,
                    partitions: 0,
                    matches: false,
                    seeded: 0,
                    skipped: names.skipped,
                });
                continue;
            }
            const {logical, physical} = names;
            const asked = declaration.partitions ?? 1;
            let created = false;
            let exists = false;
            let partitions = 0;
            try {
                if (options.create) {
                    const shape = await topicCreate(clients, connection, {
                        topic: physical,
                        partitions: asked,
                        replicationFactor: declaration.replicationFactor,
                        config: declaration.config,
                    });
                    created = shape.created;
                    exists = true;
                    partitions = shape.partitions;
                } else {
                    const seen = await topicDescribe(clients, connection, physical, {timeoutMs});
                    exists = seen.exists;
                    partitions = seen.partitions;
                }
            } catch (error) {
                // The broker could not be read or written at all, so the declaration is not
                // observed present — which is what a `required` one refuses the start over.
                options.signal?.frameworkKafkaTopicFailed?.({
                    topic: logical,
                    physical,
                    error: messageOf(error),
                });
            }
            const matches = exists && partitions === asked;
            let seeded = 0;
            if (exists && options.create && declaration.seed?.length) {
                try {
                    const holds = await topicHolds(
                        clients,
                        connection,
                        physical,
                        declaration.seed.map(message => message.value),
                        {budgetMs: timeoutMs},
                    );
                    if (holds === 'unknown') {
                        options.signal?.frameworkKafkaTopicSkipped?.({
                            topic: logical,
                            physical,
                            reason: 'seed not checked: the topic did not deliver inside its budget',
                        });
                    }
                    if (holds === 'absent') {
                        producer ||= clients.producer(reportProducerConfig(connection));
                        for (const message of declaration.seed) {
                            await messageSend(
                                clients,
                                connection,
                                {topic: physical, key: message.key, value: message.value},
                                {producer, timeoutMs: timeoutMs * 2},
                            );
                            seeded += 1;
                        }
                    }
                } catch (error) {
                    options.signal?.frameworkKafkaTopicFailed?.({
                        topic: logical,
                        physical,
                        error: messageOf(error),
                    });
                }
                if (seeded) {
                    options.signal?.frameworkKafkaTopicSeeded?.({topic: logical, physical, seeded});
                }
            }
            options.signal?.frameworkKafkaTopicProvisioned?.({
                topic: logical,
                physical,
                created,
                partitions,
                matches,
            });
            outcomes.push({
                topic: logical,
                physical,
                required: declaration.required === true,
                created,
                exists,
                partitions,
                matches,
                seeded,
            });
        }
    } finally {
        try {
            producer?.disconnect();
        } catch {
            // A producer that never connected has nothing to leave behind.
        }
    }
    const named = (outcome: ITopicOutcome): string =>
        outcome.topic === outcome.physical ? outcome.topic : `${outcome.topic} (${outcome.physical})`;
    const missing = outcomes.filter(outcome => outcome.required && !outcome.exists);
    for (const outcome of missing) {
        options.signal?.frameworkKafkaTopicMissing?.({
            topic: outcome.topic,
            physical: outcome.physical,
            hint: 'declared required; set topics.failOnMissing to false to start without it',
        });
    }
    if (missing.length && options.failOnMissing !== false) {
        const names = [...new Set(missing.map(named))].join(', ');
        const single = missing.length === 1;
        throw new Error(
            `Kafka topic${single ? '' : 's'} ${names} ${single ? 'is' : 'are'} required and ${single ? 'is' : 'are'} not present`,
        );
    }
    return outcomes;
}

/** One asset group, as the loader registers a folder of YAML files (`@@D-1001`). */
export interface ITopicAssetGroup {
    assets?: Record<string, string>;
}

/**
 * The part of an adapter the topic step uses (`@@D-1001`).
 *
 * Named rather than reached for through the adapter's own type: the step reads asset files, the
 * namespace guard and the signal vocabulary, and nothing else about the adapter — which is what
 * lets a unit test drive it with a stand-in.
 */
export interface ITopicProvisionContext {
    config: {
        clientFactory?: IKafkaClients;
        connection: Parameters<IKafkaClients['consumer']>[0];
        topics?: {create?: boolean; failOnMissing?: boolean};
        tenant?: unknown;
        allowForeignTopic?: boolean;
        topicPrefix?: string;
        topicNamespace?: string;
        namespace?: string | string[];
        id?: string;
    };
    signal?: VocabularyProxy;
    attach?: (patterns: (string | RegExp)[] | string | RegExp, target?: object) => Promise<object>;
    platform: {
        readFileSync(
            path: string,
            options: {encoding: 'utf-8'},
        ): {toString(encoding?: string): string};
        basename(name: string, ext?: string): string;
    };
}

/**
 * The namespace a declaration's topics are claimed under when no call names one (`@@D-1001`).
 *
 * `config.namespace` is what the port answers as; `config.id` is what the loader made — the last
 * segment of `agent.kafka` stands in where the realm's config block named no namespace at all.
 */
export const namespaceOf = (config: ITopicProvisionContext['config']): string => {
    const declared = config.namespace;
    const first = Array.isArray(declared) ? declared[0] : declared;
    return String(first ?? config.id?.split('.').pop() ?? '').split('.')[0];
};

/**
 * The declarations a realm ships, merged by topic name (`@@D-1001`).
 *
 * Split from the provisioning so the adapter can resolve the same declarations twice: once for the
 * broker, and once for the client each topic belongs to (`@@D-1035`).
 */
export async function declaredTopicsOf(ctx: {
    attach?: ITopicProvisionContext['attach'];
    platform: ITopicProvisionContext['platform'];
}): Promise<ITopicDeclaration[]> {
    const groups = ((await ctx.attach?.(/\.kafka\.asset$/, [] as ITopicAssetGroup[])) ??
        []) as ITopicAssetGroup[];
    const declared = new Map<string, ITopicDeclaration>();
    for (const group of groups) {
        const assets = Object.entries(group?.assets ?? {}).sort(([, a], [, b]) =>
            ctx.platform.basename(a).localeCompare(ctx.platform.basename(b)),
        );
        for (const [name, path] of assets) {
            const location = path.startsWith('file://') ? path.slice(7) : path;
            const document = yaml.parse(
                ctx.platform.readFileSync(location, {encoding: 'utf-8'}).toString('utf-8'),
            );
            for (const declaration of topicDeclarationsOf(document, name)) {
                declared.set(declaration.topic, {
                    ...declared.get(declaration.topic),
                    ...declaration,
                });
            }
        }
    }
    return [...declared.values()];
}

/**
 * Provision the declarations a realm ships, under this instance's policy (`@@D-1001`).
 *
 * Split from the reading so the adapter can resolve the same declarations twice: once for the
 * broker, and once for the client each topic belongs to (`@@D-1035`).
 */
export function provisionOf(
    config: ITopicProvisionContext['config'],
    declarations: ITopicDeclaration[],
    signal?: VocabularyProxy,
): Promise<ITopicOutcome[]> {
    if (!declarations.length) return Promise.resolve([]);
    return topicProvision(
        config.clientFactory ?? nodeRdkafkaClients,
        config.connection,
        declarations,
        {
            create: config.topics?.create === true,
            failOnMissing: config.topics?.failOnMissing !== false,
            signal,
            resolve: declaration => {
                const logical = claimTopic(config, namespaceOf(config), declaration.topic);
                // A declaration that names the broker's topic is taken at its word: it is the
                // escape for a feed several environments must agree on the name of (`@@D-1003`).
                return {
                    logical,
                    physical: declaration.physical
                        ? declaration.physical
                        : physicalTopicOf(config, logical),
                };
            },
        },
    );
}

/**
 * Read the declarations the loaded realms hold, and provision them (`@@D-1001`).
 *
 * The declarations arrive as `meta/kafka/*.yaml` assets — `<realm>.kafka.asset` handler groups,
 * the same shape the database's seeds use — so a realm contributes topics the way it contributes
 * anything else declarative, and the instance's namespace guard decides which are its own. Two
 * files that name one topic are merged field by field, the later file winning, which is what the
 * map they are written as is for; the order is the file's own name, so it is the same on every
 * start and in every process.
 */
export async function provisionDeclaredTopics(
    ctx: ITopicProvisionContext,
): Promise<ITopicOutcome[]> {
    const declarations = await declaredTopicsOf(ctx);
    return provisionOf(ctx.config, declarations, ctx.signal);
}
