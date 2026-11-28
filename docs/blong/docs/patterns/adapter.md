# Adapter

Blong includes the following commonly used adapters:

## Adapter catalogue

The drivers below are built into the runtime, in `core/blong-gogo/src/adapter/server/`, and each one
is opt-in: an adapter is off until a layer attaches it. The **namespace** is chosen by the layer
that attaches it, so the prefixes in this table are the conventions the repository's own suites and
the `blong-commander` dev adapters use — a realm is free to pick another one.

| Adapter              | Namespace and example triples                                                                               | Driver                            | Exercised by                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------- |
| Kubernetes           | `cluster.*` — `cluster.pod.find`, `cluster.pod.log`, `cluster.namespace.list`                               | `@kubernetes/client-node`         | `test/blong-int-adapter/k8s`      |
| Keycloak             | `auth.*` — `auth.user.add`, `auth.realm.find`, `auth.token.create`                                          | `@keycloak/keycloak-admin-client` | `test/blong-int-adapter/keycloak` |
| S3 and S3-compatible | `storage.*` — `storage.bucket.list`, `storage.object.get`, `storage.object.add`                             | `@aws-sdk/client-s3`              | `test/blong-int-adapter/s3`       |
| Vault                | `secrets.*` — `secrets.secret.get`, `secrets.secret.write`, `secrets.mount.list`                            | `node-vault`                      | `test/blong-int-adapter/vault`    |
| SQL                  | `sql.*` — `sql.<table>.find`, `sql.schema.list`, `sql.schemaTable.sync`                                     | `knex` + `mysql2`                 | `test/blong-int-adapter/mysql`    |
| MongoDB              | `mongo.*` — `mongo.collection.find`, `mongo.collection.add`, `mongo.database.list`                          | `mongodb`                         | `test/blong-int-adapter/mongodb`  |
| Kafka                | `broker.*` — `broker.topic.list`, `broker.topic.find`                                                       | `node-rdkafka`                    | `test/blong-int-adapter/kafka`    |
| Redis                | `redis.*` — `redis.key.get`, `redis.key.set`, `redis.hash.getAll`                                           | `ioredis`                         | `test/blong-int-adapter/redis`    |
| Slack                | `slack.*` — `slack.message.send`, `slack.prompt.send`                                                       | `adapter.webhook`                 | `realm/blong-chat`                |
| GitHub               | `github.*` — `github.release.get`, `github.release.create`, `github.release.list`                           | `octokit`                         | manual                            |
| HTTP                 | any namespace — the layer names it                                                                          | `got`                             | `test/blong-int-adapter/http`     |
| TCP                  | any namespace — a codec decides the payload                                                                 | `node:net` + `ut-bitsyntax`       | `test/blong-sim-tcp/payshield`    |
| Webhook              | `<namespace>Webhook.request`, `<namespace>Webhook.address`, and the receiving half: `listen`, `destination` | `got` + `fastify`                 | `realm/blong-chat`                |

Two things are consistent across all of them. Credentials and connections belong to the adapter, so
a handler never sees a token or an address: Vault logs in with AppRole and rotates its own token,
the Kubernetes watcher owns the watch stream, and the S3 adapter owns the endpoint. And the driver's
own shapes are translated into triples at that boundary — an object name becomes a bucket plus a
key, a collection name becomes the table of a CRUD triple.

The class of a driver does not matter: Kubernetes, Keycloak, S3, Vault, Slack, GitHub, SQL, MongoDB,
Kafka and Redis all reach the rest of the framework as the same thing, a handler that answers a
semantic triple. See the [adapter concept](../concepts/adapter.md) for what that boundary is for.

## TCP

Used for stream-based adapters.

To use them follow this pattern:

```ts
// realmname/adapter/adaptername.ts
import {adapter} from '@feasibleone/blong';

export default adapter<object>(api => ({
    extends: 'adapter.tcp',
}));
```

TCP adapter configuration properties:

```yaml
host: hsm.example.com # host to connect to
port: 1500 # port to connect to
listen: false # set to true to listen for connections
localPort: # port to listen for connections
socketTimeOut: # inactivity disconnect timeout
maxConnections: # maximum number of connections to accept
connectionDropPolicy: # which connections to drop
format:
    size: 16/integer # the format of the size header
imports: ctp.payshield # codec name
ctp.payshield:
    headerFormat: 6/string-left-zero # codec params
idleSend: 10000 # echo interval in milliseconds
maxReceiveBuffer: 4096 # maximum size in bytes of a single message
tls: # TLS config
    ca: /some/path/ca.crt
    cert: /some/path/tls.crt
    key: /some/path/tls.key
```

## HTTP

Used for HTTP-based adapters.

```ts
// realmname/adapter/adaptername.ts
import {adapter} from '@feasibleone/blong';

export default adapter<object>(api => ({
    extends: 'adapter.http',
}));
```

HTTP adapter configuration properties:

```yaml
url: http://example.com # Base URL for all requests
tls: # TLS config
    ca: /some/path/ca.crt
    cert: /some/path/tls.crt
    key: /some/path/tls.key
```

:::note When using OpenAPI/Swagger definitions, make sure to include `'codec.openapi'` in `imports`
property.

:::

## Topics a realm declares

Kafka has no schema to sync, so the adapter takes the shape of its topics from the realms that use
them. A realm writes the topics it reads or writes into a folder under its `meta`, whose YAML files
the loader registers as one `.kafka.asset` handler group:

```yaml
# <realm>/meta/kafka/feed.yaml
topics:
    blong.agent.telemetry:
        partitions: 12
        retention.ms: 604800000
        retention.bytes: 104857600
        cleanup.policy: delete
        required: true
        seed:
            - key: demo
              value: '{"kind":"demo"}'
    blong.shared.feed:
        # The name several environments must agree on, whatever tenant this process has.
        physical: blong-integration
        partitions: 1
```

The key is the topic's logical name. `partitions` and `replicationFactor` are the arguments of the
create; every other key is the topic's **config, named as Kafka names it**, and is handed to the
broker unchanged — `retention.ms` and `retention.bytes` end a topic's history whichever comes first,
`cleanup.policy` decides between deleting and compacting, and the rest of the topic-level set
(`segment.bytes`, `min.insync.replicas`, `max.message.bytes`, …) is accepted the same way. A name
the adapter does not know is refused rather than passed on, because a broker accepts a create with a
misspelt setting and then ignores it, and a value is checked against the kind its name declares.
`required`, `seed` and `physical` are the adapter's own fields, lifted out before the config reaches
the broker: `required` is what a start refuses to lose, `seed` is what a feed with nothing in it
gets — those rows are produced only when the topic does not already hold them, so a broker that
keeps its volume is seeded once — and `physical` names the broker's topic outright and switches the
tenant prefix off for that one declaration. Leave `physical` out and the physical name is the key,
as above. Because the declarations are a map, a second file that names one topic changes it by field
instead of restating the whole set.

What a process does with the declarations is its own `topics` block: `create` makes a topic the
broker does not have, and `failOnMissing` (default `true`) refuses the start when a `required` topic
is not observed present afterwards. The base adapter already carries the sensible per-intent blocks:
`dev` provisions best-effort and publishes under the developer's own tenant, `integration` is the
same without the tenant, `upgrade` provisions for the deployment and refuses when it cannot, and
`release` names nothing — so a realm's instance only says what it is. A declaration outside the
instance's namespace is left to the instance that owns it, so one process can carry several Kafka
instances on one broker.

### Logical and physical names

An operation names a topic **logically** — the name a realm declares and its handlers use. A process
with a `tenant` (the `dev` block derives one from the user name, next to how the database adapter
derives its database) addresses `<tenant>.<logical>` on the broker, so two checkouts or two tenants
can share one broker without reading each other's records. A declaration that writes `physical`
names the broker's topic instead of deriving it. Answers about the topic the caller asked about
speak the logical name again, while a reader of `topic.list` is shown the broker's own names, which
it can hand straight back to an operation.

`physical:<name>` names a topic on the broker that carries no tenant at all — a cluster's shared
feed — when a _call_ rather than a declaration needs one. Kafka's rules for a topic name exclude
`:`, so the marker cannot be mistaken for one.

A consumer group is mapped the same way: `consume.groupId` becomes `<tenant>.<groupId>`, because a
group is what splits a subscription between its members, so two tenants sharing one would take half
of each other's partitions and commit offsets for one group. `physical:<groupId>` keeps a group at
the broker's own name, for one an operator watches across environments. The ids the adapter makes
for itself are unique by construction and stay unprefixed.

## Producers, consumers and feeds

A Kafka instance does not have _a_ producer and _a_ consumer: it has the ones its config declares,
by alias. A logical topic picks one by the `topics` patterns its spec writes, and the spec named
`default` answers for the rest — patterns are matched against the **logical** name, so the tenant
prefix is not part of the choice:

```yaml
kafka:
    connection: {…}
    producer:
        default: {config: {acks: all}}
        audit: {topics: ['blong.audit.*'], eager: true}
    consumer:
        readers: {topics: ['blong.agent.*'], groupId: blong-readers, assign: true}
    feed:
        wake:
            topics: ['blong.agent.wake']
            groupId: blong-agent-wake
            concurrency: 1
            commit: {every: 100, ms: 1000}
            attempts: 3
            deadLetter: blong.agent.dead
```

Every client uses the instance's one `connection` — a second broker or a different credential is a
second instance, not a field of a spec. A spec's `config` is the client's own librdkafka settings
and is checked against a kind-specific table, because librdkafka ignores a key it does not know: a
misspelt `acks` would silently leave the default. `group.id` is refused in a consumer's `config`,
where `groupId` owns that name — and it is the value that carries the tenant.
`producer.<alias>.eager` opens the client during `start()`, so a deployment whose writes matter
fails its migration step rather than its first send; everything else is made on first use and kept
until `stop()`, which flushes a producer before closing it. `transactionalId` is accepted and
refused at `start()`: transactions are reserved, not written.

`{ns}.client.list` answers every client the instance could bring up, and `{ns}.topic.resolve` says
which producer, consumer and feed carry one logical topic. Both exist so a resolution can be read
rather than inferred from the shape of a name.

A **feed** is a subscription put to work, not a reader other things share, which is why it repeats
the consumer fields instead of pointing at a `consumer` entry. Each feed runs one loop over its own
consumer: a record is decoded by the instance's codec — which fills `$meta.method` and `$meta.mtid`,
so the record _is_ a call — dispatched like any other call, and committed only once the dispatch
finished. `concurrency` (default 1) is how many records may be in flight; with more than one, the
commit is the **contiguous prefix** per partition, so a crash re-delivers a processed range but
never skips an unprocessed record. `enable.auto.commit` and `enable.auto.offset.store` are forced
off, and the commit style is the feed's own (`{every, ms}`, default 100 records or one second).
`stop()` commits what it can inside a second and closes the consumer, and the offsets a commit does
not carry are re-delivered rather than lost.

A record that throws is not committed: it is retried after a short pause, and once `attempts`
(default 3) is spent it is produced to the feed's `deadLetter` topic — a logical topic like any
other, so it belongs in `meta/kafka` — carrying its original bytes and `x-blong-*` headers naming
the error, the attempt count and the record's place on the broker. A feed with no `deadLetter`
retries without end and reports it, because a topic nobody declared is a topic nobody provisions.

## Configuration

All adapters share some common configuration properties, such as:

- `logLevel` - the log level for the adapter
- `namespace` - prefixes used to call the adapter API
- `imports` - handlers to attach in the adapter

See the [configuration pattern](./configuration.md) for more details about the places where adapters
can be configured.
