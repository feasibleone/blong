---
name: blong-adapter
description: Integrate Blong with external systems using adapter pattern. Supports HTTP/REST APIs, TCP protocols, SQL databases, and webhooks. Hides protocol details behind high-level APIs. Use this skill whenever the user wants to connect to a database, call an external API, integrate with an HSM or payment terminal, or wire up any external dependency — even if they just say 'add database support' or 'call this API'.
---

# Implementing an Adapter

## [CRITICAL_GUARDRAILS]

- **Adapters never call other adapters directly** — coordinate via orchestrators.
- **Thin layer.** Translate semantic-triple internal API ↔ external system API; no business logic.
- **Translate protocol errors to domain errors** (`errors.xxx`) — never leak raw protocol errors.
- **Never import other handlers.** Use the `handler`/`lib` proxies (IoC).
- **Always forward `$meta`** on every downstream call.
- **Co-locate config** in the layer's `activation` — not the realm `server.ts`.
- **Name adapters depending on the place** - in blong-gogo they are named after the protocol or technology,
  while their instantiations (e.g. in realms) are named after their role.

Canonical framework rules + archetypes:
`.github/skills/_shared/conventions.md` → `[CRITICAL_GUARDRAILS]`, `[ARCHETYPE: ADAPTER_HTTP]`,
`[CONFIG_EXAMPLE]`. For REST client/server see **blong-rest**; protocols see **blong-codec**.

## Adapter Types

### 1. Stream-Based Adapters (TCP)

For TCP protocols with custom serialization:

- **Handlers:** `encode`/`decode` for serialization
- **Flow:** `send` → `encode` → TCP Stream → `decode` → `receive` → `dispatch`
- **Examples:** Payshield HSM, SMPP, ISO8583, APTRA/NDC

### 2. API-Based Adapters (HTTP/SDK)

For higher-level protocols:

- **Flow:** `send` → `execute` → `receive` → `dispatch`
- **Examples:** REST APIs, SOAP, database clients
- **No codec needed:** JavaScript objects used directly

## File Structure

```
adapter/
├── db.ts                    # Database adapter definition
├── http.ts                  # HTTP adapter definition
├── tcp.ts                   # TCP adapter definition
├── db/                      # Handler group: realmname.db
│   ├── userAdd.ts
│   ├── userFind.ts
│   └── encode.ts           # Stream adapter: encode handler
└── http/                    # Handler group: realmname.http
    ├── send.ts             # Transform before sending
    ├── receive.ts          # Transform after receiving
    └── ready.ts            # Called when adapter ready
```

## Built-in Adapters

### 1. HTTP Adapter

**Use Cases:**

- REST API integration
- Webhook handling
- OpenAPI/Swagger services
- JSON-RPC communication

**Implementation:**

```typescript
// realmname/adapter/http.ts
import {adapter} from '@feasibleone/blong';

export default adapter(blong => ({
    extends: 'adapter.http',

    validation: blong.type.Object({
        url: blong.type.String(),
        namespace: blong.type.Optional(
            blong.type.Union([blong.type.String(), blong.type.Array(blong.type.String())]),
        ),
        imports: blong.type.Optional(blong.type.Array(blong.type.String())),
        logLevel: blong.type.Optional(blong.type.String()),
    }),

    activation: {
        default: {
            url: 'https://api.example.com',
            namespace: ['external'],
            imports: ['codec.openapi'],
            logLevel: 'info',
        },
        dev: {
            url: 'http://localhost:8080',
            logLevel: 'trace',
        },
    },
}));
```

**Extra config keys:** `tls: {ca, cert, key}` for client certificates (the rest — `url`,
`namespace`, `imports`, `logLevel` — are shown in the TS `activation` above).

### 2. TCP Adapter

**Use Cases:**

- Custom binary protocols
- HSM communication (Payshield, Thales)
- Legacy system integration
- High-performance protocols

**Implementation:**

```typescript
// realmname/adapter/tcp.ts
import {adapter} from '@feasibleone/blong';

export default adapter(blong => ({
    extends: 'adapter.tcp',

    activation: {
        default: {
            host: 'hsm.example.com',
            port: 1500,
            namespace: ['hsm'],
            imports: ['realmname.hsm'],
            format: {
                size: '16/integer', // Message size header format
            },
            idleSend: 10000, // Echo interval (ms)
            maxReceiveBuffer: 4096, // Max message size
        },
    },
}));
```

**Configuration Properties:**

```yaml
host: hsm.example.com # Host to connect to
port: 1500 # Port number
listen: false # Set true to listen for connections
localPort: 9000 # Port to listen on
socketTimeOut: 30000 # Inactivity timeout (ms)
maxConnections: 10 # Max concurrent connections
connectionDropPolicy: oldest # Which connections to drop
format:
    size: 16/integer # Size header format
imports: [realmname.codec] # Codec handlers
idleSend: 10000 # Echo interval (ms)
idleReceive: 30000 # Expect message within (ms)
maxReceiveBuffer: 4096 # Max single message size
tls: # TLS configuration
    ca: /path/to/ca.crt
    cert: /path/to/server.crt
    key: /path/to/server.key
```

### 3. Database Adapter (Knex)

**Use Cases:**

- SQL database operations
- Transaction management
- Stored procedure calls

**Implementation:**

```typescript
// realmname/adapter/db.ts
import {adapter} from '@feasibleone/blong';

export default adapter(blong => ({
    extends: 'adapter.knex',

    activation: {
        default: {
            namespace: ['sql'],
            imports: ['realmname.db'],
            client: 'pg',
            connection: {
                host: 'localhost',
                user: 'dbuser',
                password: 'dbpass',
                database: 'mydb',
            },
        },
    },
}));
```

**JSON columns (`*JSON` suffix).** The knex adapter automatically (de)serializes any column whose
name ends in `JSON`: object/array values are `JSON.stringify`'d on `insert`/`update` and parsed
back on read. Declare such columns with `type.stringNull()` in the realm schema — see the
`blong-schema` skill. No adapter code needed; it applies to every queryBuilder produced by the
shared `srv.db` adapter (implementation: `blong-gogo/src/adapter/schema/knex/json.ts`).

**Config flow: handlers vs library factories (shared `srv.db` adapter).** Handler groups imported
by the shared `srv.db` knex adapter (e.g. an access realm's `adapter/db` group, `core.db`,
`party.db`) get their configuration from **two distinct slices** — verify which one your code
reads before deciding where to declare defaults:

- **Handler `this.config`** = the *adapter's config slice* (`port.config[namespace]`). This is fed
  by `srv.db.<key>` in the **suite's** server entry (`index.ts`). A realm's `server.ts` config does
  **not** reach handlers' `this.config`, and neither does suite `access.db.*`-style nesting.
- **`library()` factory `config`** = the *realm's group config slice*
  (`moduleConfig['<group>']`). This is fed by the realm's **own `server.ts`** under the group key,
  e.g. `config.default.db.password` reaches the `adapter/db` library as `config.password`. This is
  the **reusable, realm-owned** way to provide defaults that every suite gets automatically
  (blong-access declares its credential-hashing fallback this way).

Additionally, an imported `.db` handler group's own `config` export (e.g. `meta/db/db.ts` returning
`config: {schema, ...}`) is merged into the adapter config, which is how the schema declaration
reaches the `srv.db` adapter.

### 4. Webhook Adapter

**Use Cases:**

- Receive HTTP webhooks
- Handle incoming HTTP requests
- API endpoint implementation

**Implementation:**

```typescript
// realmname/adapter/webhook.ts
import {adapter} from '@feasibleone/blong';

export default adapter(() => ({
    extends: 'adapter.webhook',
}));
```

### 5. MongoDB Adapter

**Use Cases:**

- NoSQL document storage
- Collection-based data management
- Schema-less data storage

**Implementation:**

```typescript
// realmname/adapter/kv.ts
import {adapter} from '@feasibleone/blong';

export default adapter<object>(api => ({
    extends: 'adapter.mongodb',
}));
```

**Configuration:**

```typescript
activation: {
    default: {
        kv: {
            namespace: 'kv',
            imports: 'release.kv',
        }
    }
}
```

### 6. Kubernetes Adapter

**Use Cases:**

- Kubernetes cluster management
- Deploy/manage resources
- Monitor cluster state

**Implementation:**

```typescript
// realmname/adapter/k8s.ts
import {adapter} from '@feasibleone/blong';

export default adapter<object>(api => ({
    extends: 'adapter.k8s',
}));
```

**Configuration:**

```typescript
activation: {
    default: {
        k8s: {
            namespace: 'k8s',
            imports: 'release.k8s',
        }
    }
}
```

### 7. S3 Storage Adapter

**Use Cases:**

- Object storage operations
- File upload/download
- Cloud storage integration

**Implementation:**

```typescript
// realmname/adapter/storage.ts
import {adapter} from '@feasibleone/blong';

export default adapter<object>(api => ({
    extends: 'adapter.s3',
}));
```

**Configuration:**

```typescript
activation: {
    default: {
        storage: {
            namespace: 'storage',
            imports: 'release.storage',
        }
    }
}
```

## Adapter Loop

Adapters follow a sequence of handler calls:

### Stream-Based Flow

```
send → encode → TCP Stream → decode → receive → dispatch → loop back
```

### API-Based Flow

```
send → execute → receive → dispatch → loop back
```

## Custom Handlers

Add business-specific handlers:

```typescript
// realmname/adapter/db/userAdd.ts
import {IMeta, handler} from '@feasibleone/blong';

type Handler = ({
    username: string;
    email: string;
}) => Promise<{
    userId: number;
}>;

export default handler(({errors}) =>
    async function userAdd(
        params: Parameters<Handler>[0],
        $meta: IMeta
    ): ReturnType<Handler> {
        // Database-specific logic
        // Often calls stored procedures
        const result = await $meta.connection.raw(
            'CALL user_add(?, ?)',
            [params.username, params.email]
        );

        if (!result.rows[0]) {
            throw errors.userCreateFailed();
        }

        return {
            userId: result.rows[0].user_id
        };
    }
);
```

## Stacking Handlers

Multiple handlers with the same name can be stacked:

```typescript
activation: {
    default: {
        http: {
            imports: [
                'codec.openapi',     // Base protocol
                'codec.mle',         // Message encryption
                'realmname.http'     // Custom transformations
            ]
        }
    }
}
```

Each handler in the stack transforms the data sequentially.

## Error Handling

```typescript
export default handler(
    ({errors}) =>
        async function httpCallExternal(params, $meta) {
            try {
                const response = await $meta.connection.get('/api/data');
                return response.data;
            } catch (error) {
                if (error.statusCode === 404) {
                    throw errors.resourceNotFound();
                }
                if (error.statusCode === 503) {
                    throw errors.serviceUnavailable();
                }
                throw errors.externalAPIError({cause: error});
            }
        },
);
```

## Testing with Mock Adapter

```typescript
// realmname/adapter/mock.ts
import {adapter} from '@feasibleone/blong';

export default adapter(() => ({
    extends: 'adapter.mock',
}));

// realmname/adapter/mock/userAdd.ts
export default handler(
    () =>
        async function userAdd(params) {
            // Return mock data
            return {
                userId: 123,
                username: params.username,
            };
        },
);
```

## Best Practices

- **One adapter per external system**; thin + protocol-independent.
- **Design handlers to be safely retried** (idempotent).
- **Set appropriate timeouts**; TLS for production; `trace` log level for protocol detail.
- **Create mock adapters** (`adapter.mock`) for tests — see **blong-mock-test**.

## Deployment Considerations

- Adapters deploy as separate services (microservice) or in-process (monolith) — same code.
- Framework handles connection pooling/reconnection; set intent or env specific URLs/credentials via
  intent config (`dev`/`prod`).

## Examples from Codebase

- **HTTP adapter:** `core/test/demo/adapter/http.ts`
- **TCP/Payshield:** `core/blong-sim-tcp/payshield/adapter/tcp.ts` (declarative `adapter.tcp`)
- **TCP simulation (listen: true):** `core/blong-sim-tcp/payshield/sim/payshieldSim.ts`
- **Database:** `core/test/db/adapter/sql.ts` — inspect data in dev with `blong-dev sql "SELECT ..."` (see **blong-schema** for the dev DB name derivation and auto-create)
- **Mock adapter:** `core/test/demo/adapter/mock.ts`
