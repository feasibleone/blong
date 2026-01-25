---
name: blong-adapter
description: Integrate Blong with external systems using adapter pattern. Supports HTTP/REST APIs, TCP protocols, SQL databases, and webhooks. Hides protocol details behind high-level APIs. Use when integrating with databases, external APIs, HSM devices, or any external system.
---

# Implementing an Adapter

## Overview

Adapters integrate with external systems using the adapter design pattern. They expose high-level APIs compatible with framework conventions, independent of underlying protocols (TCP, HTTP, SQL, etc.).

## Purpose

- **External Integration:** Communicate with databases, APIs, services, devices
- **Protocol Abstraction:** Hide protocol details from business logic
- **High-Level API:** Expose framework-compatible interfaces
- **Reusability:** Share adapter implementations across realms
- **Testing:** Mock external systems easily

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

export default adapter(() => ({
    extends: 'adapter.http'
}));
```

**Configuration:**

```typescript
// In realmname/server.ts
config: {
    default: {
        http: {
            url: 'https://api.example.com',      // Base URL
            namespace: ['external'],              // API namespace
            imports: ['codec.openapi'],           // HTTP codec
            logLevel: 'info'
        }
    },
    dev: {
        http: {
            url: 'http://localhost:8080',
            logLevel: 'trace',
            'codec.openapi': {
                namespace: {
                    external: [
                        './api/swagger.yaml',    // Local OpenAPI spec
                        './api/operations.yaml'  // Additional operations
                    ]
                }
            }
        }
    }
}
```

**Configuration Properties:**

```yaml
url: https://api.example.com     # Base URL for requests
namespace: [external]             # Prefixes for calling adapter
imports: [codec.openapi]          # Codecs to use
logLevel: info                    # Log level
tls:                              # TLS configuration
  ca: /path/to/ca.crt
  cert: /path/to/client.crt
  key: /path/to/client.key
```

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

export default adapter(() => ({
    extends: 'adapter.tcp'
}));
```

**Configuration:**

```typescript
config: {
    default: {
        tcp: {
            host: 'hsm.example.com',
            port: 1500,
            namespace: ['hsm'],
            imports: ['realmname.hsm'],
            format: {
                size: '16/integer'               // Message size header format
            },
            'realmname.hsm': {
                headerFormat: '6/string-left-zero'
            },
            idleSend: 10000,                     // Echo interval (ms)
            maxReceiveBuffer: 4096               // Max message size
        }
    }
}
```

**Configuration Properties:**

```yaml
host: hsm.example.com            # Host to connect to
port: 1500                       # Port number
listen: false                    # Set true to listen for connections
localPort: 9000                  # Port to listen on
socketTimeOut: 30000             # Inactivity timeout (ms)
maxConnections: 10               # Max concurrent connections
connectionDropPolicy: oldest     # Which connections to drop
format:
  size: 16/integer               # Size header format
imports: [realmname.codec]       # Codec handlers
idleSend: 10000                  # Echo interval (ms)
idleReceive: 30000               # Expect message within (ms)
maxReceiveBuffer: 4096           # Max single message size
tls:                             # TLS configuration
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

export default adapter(() => ({
    extends: 'adapter.knex'
}));
```

**Configuration:**

```typescript
config: {
    default: {
        db: {
            namespace: ['sql'],
            imports: ['realmname.db'],
            client: 'pg',                        // Database client
            connection: {
                host: 'localhost',
                user: 'dbuser',
                password: 'dbpass',
                database: 'mydb'
            }
        }
    }
}
```

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
    extends: 'adapter.webhook'
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
config: {
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
config: {
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
config: {
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

## Internal Handlers

Adapters can implement these predefined handlers:

### 1. send

Transform data before sending:

```typescript
// realmname/adapter/http/send.ts
import {handler} from '@feasibleone/blong';

export default handler(() =>
    function send(params) {
        return {
            ...params,
            timestamp: new Date().toISOString(),
            version: '1.0'
        };
    }
);
```

### 2. receive

Transform received data:

```typescript
// realmname/adapter/http/receive.ts
import {handler} from '@feasibleone/blong';

export default handler(() =>
    function receive(response) {
        return {
            data: response.body,
            status: response.statusCode,
            receivedAt: new Date()
        };
    }
);
```

### 3. encode (Stream adapters)

Convert JavaScript object to Buffer:

```typescript
// realmname/adapter/tcp/encode.ts
import {handler} from '@feasibleone/blong';

export default handler(({lib: {bitsyntax}}) =>
    function encode(message) {
        return bitsyntax.build(
            '4/string, command:2/string',
            {
                command: message.command,
                data: message.data
            }
        );
    }
);
```

### 4. decode (Stream adapters)

Convert Buffer to JavaScript object:

```typescript
// realmname/adapter/tcp/decode.ts
import {handler} from '@feasibleone/blong';

export default handler(({lib: {bitsyntax}}) =>
    function decode(buffer) {
        const parsed = bitsyntax.parse(
            buffer,
            'command:2/string, data/binary'
        );
        return {
            command: parsed.command,
            data: parsed.data.toString()
        };
    }
);
```

### 5. ready

Called when adapter is ready:

```typescript
// realmname/adapter/tcp/ready.ts
import {handler} from '@feasibleone/blong';

export default handler(({log}) =>
    async function ready() {
        log.info('TCP adapter ready');
        // Perform initialization
    }
);
```

### 6. idleSend

Send keep-alive message:

```typescript
// realmname/adapter/tcp/idleSend.ts
import {handler} from '@feasibleone/blong';

export default handler(({handler: {encode}}) =>
    async function idleSend() {
        return encode({command: 'PING'});
    }
);
```

### 7. idleReceive

Handle idle timeout:

```typescript
// realmname/adapter/tcp/idleReceive.ts
import {handler} from '@feasibleone/blong';

export default handler(({log}) =>
    function idleReceive() {
        log.warn('No messages received, disconnecting');
        // Will trigger reconnection
    }
);
```

### 8. drainSend

Called when send queue is empty:

```typescript
// realmname/adapter/tcp/drainSend.ts
import {handler} from '@feasibleone/blong';

export default handler(() =>
    function drainSend() {
        // Process pending operations
    }
);
```

### 9. exec

Default handler when no specific handler exists:

```typescript
// realmname/adapter/http/exec.ts
import {handler} from '@feasibleone/blong';

export default handler(() =>
    function exec(params, $meta) {
        // Default execution logic
        return {result: 'processed'};
    }
);
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
config: {
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
export default handler(({errors}) =>
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
    }
);
```

## Testing with Mock Adapter

```typescript
// realmname/adapter/mock.ts
import {adapter} from '@feasibleone/blong';

export default adapter(() => ({
    extends: 'adapter.mock'
}));

// realmname/adapter/mock/userAdd.ts
export default handler(() =>
    async function userAdd(params) {
        // Return mock data
        return {
            userId: 123,
            username: params.username
        };
    }
);
```

## Best Practices

1. **Protocol Independence:** Hide protocol details from orchestrators
2. **Error Translation:** Convert protocol errors to domain errors
3. **Thin Layer:** Keep adapters focused on integration, not business logic
4. **Idempotency:** Design handlers to be safely retried
5. **Connection Pooling:** Let framework handle connection management
6. **Timeout Configuration:** Set appropriate timeouts for external systems
7. **Logging:** Use appropriate log levels (trace for protocol details)
8. **Mock for Testing:** Create mock adapters for testing
9. **TLS Configuration:** Use TLS for production communications
10. **One Adapter Per External System:** Create separate adapters for different systems

## Deployment Considerations

- **Microservices:** Adapters can be deployed as separate services
- **Connection Management:** Framework handles connection pooling and reconnection
- **Scaling:** Adapters scale independently based on load
- **Configuration:** Use environment-specific configuration for URLs, credentials
- **Monitoring:** Framework provides metrics for adapter performance

## Examples from Codebase

- **HTTP adapter:** `core/test/demo/adapter/http.ts`
- **TCP/Payshield:** `core/test/payshield/adapter/tcp.ts`
- **Database:** `core/test/db/adapter/sql.ts`
- **Mock adapter:** `core/test/demo/adapter/mock.ts`
