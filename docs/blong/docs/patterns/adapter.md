# Adapter

Blong includes the following commonly used adapters:

## Adapter catalogue

The drivers below are built into the runtime, in `core/blong-gogo/src/adapter/server/`, and each one
is opt-in: an adapter is off until a layer attaches it. The **namespace** is chosen by the layer
that attaches it, so the prefixes in this table are the conventions the repository's own suites and
the `blong-commander` dev adapters use — a realm is free to pick another one.

| Adapter              | Namespace and example triples                                                      | Driver                            | Exercised by                      |
| -------------------- | ---------------------------------------------------------------------------------- | --------------------------------- | --------------------------------- |
| Kubernetes           | `cluster.*` — `cluster.pod.find`, `cluster.pod.log`, `cluster.namespace.list`      | `@kubernetes/client-node`         | `test/blong-int-adapter/k8s`      |
| Keycloak             | `auth.*` — `auth.user.add`, `auth.realm.find`, `auth.token.create`                 | `@keycloak/keycloak-admin-client` | `test/blong-int-adapter/keycloak` |
| S3 and S3-compatible | `storage.*` — `storage.bucket.list`, `storage.object.get`, `storage.object.add`    | `@aws-sdk/client-s3`              | `test/blong-int-adapter/s3`       |
| Vault                | `secrets.*` — `secrets.secret.get`, `secrets.secret.write`, `secrets.mount.list`   | `node-vault`                      | `test/blong-int-adapter/vault`    |
| SQL                  | `sql.*` — `sql.<table>.find`, `sql.schema.list`, `sql.schemaTable.sync`            | `knex` + `mysql2`                 | `test/blong-int-adapter/mysql`    |
| MongoDB              | `mongo.*` — `mongo.collection.find`, `mongo.collection.add`, `mongo.database.list` | `mongodb`                         | `test/blong-int-adapter/mongodb`  |
| Kafka                | `broker.*` — `broker.topic.list`, `broker.topic.find`                              | `node-rdkafka`                    | `test/blong-int-adapter/kafka`    |
| Redis                | `redis.*` — `redis.key.get`, `redis.key.set`, `redis.hash.getAll`                  | `ioredis`                         | `test/blong-int-adapter/redis`    |
| Slack                | `slack.*` — `slack.message.send`                                                   | `@slack/webhook`                  | manual                            |
| GitHub               | `github.*` — `github.release.get`, `github.release.create`, `github.release.list`  | `octokit`                         | manual                            |
| HTTP                 | any namespace — the layer names it                                                 | `got`                             | `test/blong-int-adapter/http`     |
| TCP                  | any namespace — a codec decides the payload                                        | `node:net` + `ut-bitsyntax`       | `test/blong-sim-tcp/payshield`    |
| Webhook              | `<namespace>Webhook.request`, `<namespace>Webhook.publish`                         | `got`                             | —                                 |

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

## Configuration

All adapters share some common configuration properties, such as:

- `logLevel` - the log level for the adapter
- `namespace` - prefixes used to call the adapter API
- `imports` - handlers to attach in the adapter

See the [configuration pattern](./configuration.md) for more details about the places where adapters
can be configured.
