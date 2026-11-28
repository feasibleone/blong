/**
 * The two names a Kafka topic has — the one a realm declares and the one the broker holds
 * (`@@D-1003`).
 *
 * The logical name is the realm's: what its YAML declares, what its handlers name, and what the
 * namespace guard checks (`@@D-990`). The physical name is the broker's: the logical one under this
 * instance's tenant, or the one a `physical:` marker wrote. Every call into the broker maps one to
 * the other, and every answer speaks the logical name back, so no realm ever spells a tenant.
 */

/**
 * The topic namespace this instance owns (`@@D-990`).
 *
 * Derived from the namespace the adapter is attached as, not from the topic it is handed: a realm
 * that publishes a feed can only reach its own names, and the rule is the same on both sides of a
 * produce/consume pair because both ask this function.
 */
export function topicNamespace(
    config: {topicPrefix?: string; topicNamespace?: string; namespace?: string | string[]},
    namespaceHint: string,
): string {
    const declared = config.namespace;
    const namespace =
        config.topicNamespace ||
        (Array.isArray(declared)
            ? declared[0]
            : typeof declared === 'string'
              ? declared
              : ''
        )?.split('.')[0] ||
        namespaceHint;
    return `${config.topicPrefix ?? 'blong'}.${namespace}.`;
}

/**
 * The marker that names a topic on the broker rather than through this instance's tenant
 * (`@@D-1003`).
 *
 * Kafka's own rules for a topic name exclude `:`, so the marker cannot collide with a real name and
 * needs no escaping: `physical:blong-integration` is the topic the broker holds, whatever tenant
 * this instance publishes under.
 */
const PHYSICAL_MARKER = /^physical:/;

/** The tenant prefix, reduced to what a topic name may carry (`@@D-1003`). */
export const tenantOf = (config: {tenant?: unknown}): string =>
    String(config.tenant ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '-');

/**
 * The logical name a call, a declaration or a config entry carries (`@@D-1003`).
 *
 * Two inputs are read as the broker's own name instead — the `physical:` marker, and a name that
 * already begins with this instance's tenant, which is what a reader of `topic.list` holds — so
 * handing a physical name back to an operation addresses the topic it came from rather than one
 * under a doubled prefix.
 */
export function logicalTopicOf(config: {tenant?: unknown}, name: string): string {
    if (PHYSICAL_MARKER.test(name)) return name.replace(PHYSICAL_MARKER, '');
    const tenant = tenantOf(config);
    return tenant && name.startsWith(`${tenant}.`) ? name.slice(tenant.length + 1) : name;
}

/**
 * The name the broker holds for a logical name: `physical:` as written, else the tenant in front
 * (`@@D-1003`).
 *
 * Topics and consumer groups are named the same way, so one function answers for both; the two
 * wrappers below are what a caller reads.
 */
const physicalNameOf = (config: {tenant?: unknown}, logical: string): string => {
    if (PHYSICAL_MARKER.test(logical)) return logical.replace(PHYSICAL_MARKER, '');
    const tenant = tenantOf(config);
    return tenant ? `${tenant}.${logical}` : logical;
};

/**
 * The name the broker holds for a logical topic (`@@D-1003`).
 *
 * Without a tenant the two names are the same. With one, a logical `blong.agent.telemetry` becomes
 * `<tenant>.blong.agent.telemetry`; `physical:<name>` names the broker's own topic for a caller that
 * means one carrying no tenant at all — a cluster's shared feed.
 */
export function physicalTopicOf(config: {tenant?: unknown}, logical: string): string {
    return physicalNameOf(config, logical);
}

/**
 * The consumer group a process joins, under its tenant (`@@D-1003`).
 *
 * Two tenants on one broker that shared a group id would not be isolated by the topic prefixes
 * alone: a group is what partitions a subscription between its members, so both processes would
 * take half of each other's partitions and commit offsets for one group. The group therefore gets
 * the same mapping as the topic — `<tenant>.<group>` — and `physical:<group>` for a name that is
 * the broker's own, such as one an operator watches across environments. The ids this adapter makes
 * for itself (`freshGroup`, the explorer's per-click reader) are unique by construction and are
 * left unprefixed.
 */
export function physicalGroupOf(config: {tenant?: unknown}, logical: string): string {
    return physicalNameOf(config, logical);
}

/** The broker name for a name a config or a declaration wrote, which may already be physical. */
export const brokerTopicOf = (config: {tenant?: unknown}, name: string): string =>
    physicalTopicOf(config, logicalTopicOf(config, name));

/**
 * A record whose topic is spoken logically (`@@D-1003`).
 *
 * An answer names the topic the caller asked about; only `topic.list` — which enumerates what the
 * broker holds — answers with the broker's own names.
 */
export const logicalRecordOf = <T extends object>(config: {tenant?: unknown}, record: T): T => {
    const topic = (record as {topic?: unknown}).topic;
    return typeof topic === 'string' && topic
        ? ({...record, topic: logicalTopicOf(config, topic)} as T)
        : record;
};

/**
 * The topic a call names, or a refusal that says whose name it was (`@@T-785`).
 *
 * Answers with the **logical** name — the one the caller wrote, or the one a physical name stands
 * for (`@@D-1003`); the caller that talks to the broker maps it with `physicalTopicOf`.
 *
 * `namespaceHint` is the first segment of the method — `agent` for `agent.topic.watch` — which is
 * what an adapter whose config does not name a namespace is attached as anyway.
 */
export function claimTopic(
    config: {
        topicPrefix?: string;
        topicNamespace?: string;
        allowForeignTopic?: boolean;
        namespace?: string | string[];
        tenant?: unknown;
    },
    namespaceHint: string,
    topic: unknown,
): string {
    const name = typeof topic === 'string' ? topic : '';
    if (!name) throw new Error('Missing topic param');
    const logical = logicalTopicOf(config, name);
    if (config.allowForeignTopic) return logical;
    const prefix = topicNamespace(config, namespaceHint);
    if (!logical.startsWith(prefix)) {
        throw new Error(
            `Kafka topic ${logical} is outside the namespace ${prefix}* this adapter owns (set allowForeignTopic to admit it)`,
        );
    }
    return logical;
}
