# Configuration

Blong comes with a flexible configuration mechanism, which allows the configuration to be specified
in multiple places, such as:

- the source code of each [realm](./realm)
- configuration files
- environment variables
- command line parameters

The configuration coming from these places is merged to get the effective one. The order is fixed,
and a later source overrides an earlier one:

```mermaid
flowchart TD
    A["the platform defaults —<br/>version, platform, method, intent list"] --> B["the built-in default configuration"]
    B --> C["the realm's or suite's own config<br/>in server.ts / browser.ts"]
    C --> D["the params passed to the loader"]
    D --> E["the shared rc file —<br/>for example .blong_devrc"]
    E --> F["the suite rc file —<br/>for example .blong_blong_access_devrc"]
    F --> G["merge — a later source wins"]
    G --> H{"is a master key or<br/>a render context set?"}
    H -- "no" --> I["the effective configuration"]
    H -- "yes" --> J["the template renderer —<br/>templates resolved, master key decrypted"]
    J --> I
```

The last step is the template renderer: every string in the merged configuration is rendered as a
JavaScript template literal, so a configuration value can refer to another — `${host}`,
`${db.connection.port}` — and the master key's secrets are decrypted there. That renderer comes in a
trusted and a safe mode; see the [template pattern](./template.md).

One consequence of the ordering is worth stating on its own: an **empty value is a value**. A
tenant's rc file merges over the suite's configuration, so `user: ""` there replaces whatever
default the suite declared with nothing, while a line that is simply absent leaves the default
alone. A file that provisions a tenant therefore writes the keys it knows and leaves the rest
commented out — a comment is an absence, and an empty string is an answer.

Environment variables are not a general merge layer in that chain: `BLONG_PLATFORM`, `BLONG_METHOD`
and `BLONG_ENV` select the platform, the method and the intent list, and `BLONG_MASTER_KEY` switches
on the template render. A component that needs a secret reads its own key instead — the gateway's
pair is resolved once at load (`gateway.sign`/`gateway.encrypt`, from an rc file, an `{env}`, or a
`{generate}`), handed to both the gateway and the rpc client that verifies with it, and generated
with a warning only when nothing configured one.

## The master key

`BLONG_MASTER_KEY` is what a configuration keeps its secrets with, and it is the reason an rc file
may be read by anyone. It is 32 random bytes written as 64 hex characters — the length `aes-256-cbc`
takes — and it lives in exactly two places: the environment of the process that loads the
configuration, and the Secret a tenant keeps for it (`blong-master-key`, in the tenant's namespace).

A value that is a secret is written as a template, not as text:

```yaml
srv:
    db:
        knex:
            connection:
                password: ${decrypt('a3f95e2d…')}
```

The renderer that runs after the merge has the cipher's pair in scope, so `decrypt` resolves the
value at load and the component receives the plaintext. Before that point the file holds ciphertext,
which is what makes `cat` of an rc file, `kubectl get secret -o yaml`, or a coding agent reading a
repository safe: what is there cannot be used.

Four details are worth stating because each of them costs an afternoon:

- **The ciphertext is hex.** `cbc.decrypt` answers an empty string for a base64 blob rather than
  failing, so a base64 value yields a configuration that starts and holds an empty password. The
  tooling refuses anything that is not hex for that reason.
- **The key is 64 hex characters, not 32.** A 32-character key is the size of the _plaintext_ block,
  not of the key, and it throws `Invalid key length` on the first encrypt.
- **The renderer trims.** A secret with a leading or trailing space comes back without it.
- **A missing key is a deployment fault, not a fallback.** A workload reads `BLONG_MASTER_KEY` from
  its namespace's Secret as a _required_ variable: without it a sealed value stays the literal
  template text, and the component would hold a credential that cannot work while saying nothing
  about why.

The tooling that keeps a file in this shape is `blong-kustomize`, which runs from a checkout or from
`npx @feasibleone/blong-kustomize`:

```bash
blong-kustomize secret key --new                      # mint a key, to pipe into a Secret
blong-kustomize secret seal --file rc --paths=a.b.c   # plaintext -> ${decrypt('…')}, in place
blong-kustomize secret list --file rc                 # which paths are sealed, without opening one
blong-kustomize secret open --file rc                 # the plaintext, for a reader who holds the key
blong-kustomize secret value --random=32              # a fresh random secret, sealed
```

`provision tenant` is what puts the key in the cluster: it creates `blong-master-key` in the
tenant's namespace from `BLONG_MASTER_KEY` when the tenant has none, and leaves an existing one
alone — rotating a key makes every ciphertext that used it unreadable, which is a decision for
whoever holds the data.

## Intents and use cases

The configuration is usually split into several parts, which are activated based on the intent.
There are some established names for the intents:

- `default`: the base configuration, active for all cases
- `dev`: development features — hot reload, the introspection endpoints, error detail in RPC replies
- `release`: the block every deployed stage shares (uat, staging, production)
- `microservice`: run a realm on its own — its adapters, orchestrators and listeners
- `integration`: the extra layers and behaviour a test needs
- `upgrade`: active during database creation
- `k8s`: write a deployment tree instead of serving
- `cli`: run a command in-process and exit

## Source code configuration

The configuration coming from the source code has the purpose to define some defaults for the
appropriate use cases and environments.

### Adapter

To configure the adapter, use one of the possible configuration places:

In the same realm where the adapter is defined, define defaults and per environment configuration

```js
// realmname/server.ts
import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    config: {
        default: {
            adaptername: {
                // base configuration
                // usually namespace and imports are specified here
            },
        },
        dev: {
            adaptername: {
                // dev env overrides
            },
        },
    },
}));
```

In the global configuration, override the defaults using:

```yaml
realmname:
    adaptername:
        # global overrides
```

### Orchestrator

Orchestrators are configured the same way as adapters

### Internal components

The internal components of the framework can also be configured using the following:

```yaml
log: # global logging config
    logLevel: info # see pino config
    transport: # see pino config
watch:
    logLevel: info # log level for the watch component
adapter:
    logLevel: info # default log level for all adapters
gateway: # configuration of the API gateway
    logLevel: info # log level
    debug: true # turn on debugging details in responses
    host: 0.0.0.0 # listen address
    port: 8080 # listen port
    sign: # MLE signing key
    encrypt: # MLE encryption key
    jwt: # OpenId configuration
        audience: # JWT Audience
rpcServer: # configuration for the internal RPC calls
    logLevel: info # log level
    host: 0.0.0.0 # listen address
    port: 8091 # listen port
```

## Validation

Declare the keys a component accepts, and the load checks the merged config against them — an
unknown key or a type mismatch fails startup with the offending path named:

```typescript
// realm/adapter/db.ts
export default adapter(blong => ({
    extends: 'adapter.knex',
    validation: blong.type.Object({
        namespace: blong.type.Union([blong.type.String(), blong.type.Array(blong.type.String())]),
        logLevel: blong.type.Optional(blong.type.String()),
    }),
    activation: {default: {namespace: 'db/$subject'}},
}));
```

The check is composed from the module's structure as well as the schema, so a child key, a
registered port's name, a key the module's own source names, a key its parent declared for it and a
handler group's config key are legitimate without being declared. See the
[configuration concept](../concepts/configuration.md#validation) for the two deliberate limits.

## Where the configuration came from

A root load writes one `config.load` record naming the rc files, the environment variable names and
the command-line keys it read — names only, never values.
