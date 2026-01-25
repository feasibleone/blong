---
name: blong-codec
description: Implement protocols on top of transport layers in Blong. Includes HTTP codecs (OpenAPI, JSON-RPC, MLE) and TCP codecs (Payshield, ISO8583, SMPP). Handle serialization, deserialization, and request/response matching. Use when implementing binary protocols, calling REST APIs via OpenAPI specs, or adding message encryption.
---

# Implementing a Codec

## Overview

Codecs implement protocols on top of lower-level transport layers. They handle serialization/deserialization for TCP protocols or implement higher-level protocol semantics for HTTP.

## Purpose

- **Protocol Implementation:** Implement specific protocols (OpenAPI, JSON-RPC, ISO8583, etc.)
- **Serialization:** Convert between JavaScript objects and wire format
- **Request/Response Matching:** Handle multiplexing in async protocols
- **Message Framing:** Define message boundaries in stream protocols
- **Stack Composition:** Combine multiple codecs (e.g., OpenAPI + MLE)

## Codec Types

### HTTP Codecs

Implemented as `send`/`receive` handler pairs:

- **OpenAPI:** Call external REST APIs using OpenAPI/Swagger definitions
- **JSON-RPC:** Call framework's JSON-RPC APIs
- **MLE (Message Level Encryption):** Encrypt/decrypt messages

### TCP Codecs

Implemented as `encode`/`decode` handler pairs:

- **Payshield:** Thales/Payshield HSM protocol
- **SMPP:** SMS protocol
- **ISO8583:** Payment card protocol
- **APTRA/NDC:** ATM protocol

## Configuration Pattern

Codecs are configured within adapter configuration:

```typescript
config: {
    default: {
        adaptername: {
            namespace: ['prefix'],
            imports: ['codec.name'],      // Reference codec
            'codec.name': {               // Codec configuration
                // codec-specific config
            }
        }
    }
}
```

## Built-in HTTP Codecs

### 1. OpenAPI Codec (`codec.openapi`)

**Purpose:** Call external APIs using OpenAPI/Swagger specifications

**Use Cases:**

- REST API integration
- Third-party service integration
- Auto-generate API clients from specs

**Configuration:**

```typescript
// In realmname/server.ts
config: {
    default: {
        http: {
            namespace: ['external'],
            imports: ['codec.openapi']
        }
    },
    dev: {
        http: {
            'codec.openapi': {
                namespace: {
                    // Namespace name: array of spec sources
                    time: [
                        './api/world-time.yaml',           // Local file
                        './api/world-time.operations.yaml', // Additional ops
                        {                                   // Inline overrides
                            servers: [{
                                url: 'http://localhost:8080/rest/mocktime'
                            }]
                        }
                    ],
                    k8s: [
                        'https://k8s.io/api/apps.json',   // Remote URL
                        'https://k8s.io/api/discovery.json',
                        'https://k8s.io/api/version.json'
                    ],
                    github: [
                        './api/github.json'
                    ],
                    // Custom x-blong configuration for incoming webhooks
                    dfsp: [
                        'https://api.example.com/swagger.json',
                        './gateway/api/custom.yaml',
                        {
                            host: 'localhost:8080',
                            basePath: '/rest/endpoint',
                            'x-blong': {
                                destination: 'webhookAdapter',  // Adapter name
                                namespace: 'incoming'           // Handler namespace
                            }
                        }
                    ]
                }
            }
        }
    }
}
```

**x-blong Extension:**

The framework supports a custom `x-blong` extension for configuring webhook destinations and namespaces:

```typescript
{
    'x-blong': {
        destination: 'adapterName',  // Target adapter for incoming requests
        namespace: 'handlerPrefix'   // Namespace prefix for handlers
    }
}
```

**Usage in Handlers:**

```typescript
// Call using operationId from OpenAPI spec
export default handler(({handler: {externalGetUser}}) =>
    async function userUserFetch(params, $meta) {
        // externalGetUser corresponds to operationId in spec
        const user = await externalGetUser({
            userId: params.id
        }, {
            ...$meta,
            method: 'externalGetUser'  // operationId
        });
        return user;
    }
);
```

**OpenAPI Spec Requirements:**

- Must have `operationId` for each operation
- Can merge multiple spec files
- Supports inline overrides (servers, security, etc.)

**Example OpenAPI Spec:**

```yaml
# api/world-time.yaml
openapi: 3.0.0
info:
  title: World Time API
  version: 1.0.0
servers:
  - url: http://worldtimeapi.org/api
paths:
  /timezone/{area}/{location}:
    get:
      operationId: timeTimezoneGet
      parameters:
        - name: area
          in: path
          required: true
          schema:
            type: string
        - name: location
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Current time
          content:
            application/json:
              schema:
                type: object
                properties:
                  abbreviation:
                    type: string
                  datetime:
                    type: string
```

**x-blong-method Extension:**

For gateway API definitions, use `x-blong-method` to map REST operations to handler names:

```yaml
# gateway/api/agreement.yaml
paths:
  /quotes/{id}:
    get:
      x-blong-method: QuoteGet          # Maps to agreementQuoteGet handler
    put:
      x-blong-method: QuoteEdit         # Maps to agreementQuoteEdit handler
  /quotes:
    get:
      x-blong-method: QuoteList         # Maps to agreementQuoteList handler
    post:
      x-blong-method: QuoteCreate       # Maps to agreementQuoteCreate handler
  /quotes/{id}/error:
    put:
      x-blong-method: QuoteError        # Maps to agreementQuoteError handler

parameters:
  id:
    # UUID or ULID pattern
    pattern: ^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$|^[0-9A-HJKMNP-TV-Z]{26}$

definitions:
  QuoteId:
    pattern: ^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$|^[0-9A-HJKMNP-TV-Z]{26}$
```

**Gateway API Configuration:**

```typescript
// gateway/api/agreement.ts
import {api} from '@feasibleone/blong';

export default api(() => ({
    namespace: {
        agreement: [
            'https://external.api/swagger.json',  // External API spec
            './agreement.yaml',                    // Local additions with x-blong-method
        ],
    },
}));
```

The `x-blong-method` extension maps HTTP operations to handler names, enabling REST API definitions while using the framework's handler pattern internally.

**Additional Operations File:**

```yaml
# api/world-time.operations.yaml
paths:
  /ip:
    get:
      operationId: timeIpGet
      responses:
        '200':
          description: Time by IP
```

### 2. JSON-RPC Codec (`codec.jsonrpc`)

**Purpose:** Call framework's JSON-RPC APIs (typically from browser)

**Use Cases:**

- Browser to server communication
- Server to server RPC calls
- Microservice communication

**Configuration:**

```typescript
// Browser-side configuration
config: {
    default: {
        backend: {
            namespace: ['user', 'payment'],
            imports: ['codec.jsonrpc']
        }
    }
}
```

**Usage:**

```typescript
// Browser handler calling server
export default handler(({handler: {userUserAdd}}) =>
    async function createUser(params, $meta) {
        // Automatically calls /rpc/user/user/add
        const result = await userUserAdd({
            username: params.username,
            email: params.email
        }, $meta);
        return result;
    }
);
```

**Endpoint Convention:**

- Format: `/rpc/{namespace}/{object}/{predicate}`
- Example: `/rpc/user/user/add` for `userUserAdd`

### 3. Message Level Encryption (`codec.mle`)

**Purpose:** Encrypt/decrypt message payloads

**Use Cases:**

- End-to-end encryption
- Secure browser-server communication
- Compliance requirements

**Configuration:**

```typescript
config: {
    default: {
        backend: {
            namespace: ['user'],
            imports: [
                'codec.jsonrpc',    // Must be before codec.mle
                'codec.mle'          // Applied after jsonrpc
            ]
        }
    }
}
```

**Handler Stack Order:**

```
Browser Handler
    ↓
codec.jsonrpc (prepare RPC request)
    ↓
codec.mle (encrypt payload)
    ↓
HTTP Request
    ↓
Server
    ↓
codec.mle (decrypt payload)
    ↓
codec.jsonrpc (parse RPC request)
    ↓
Server Handler
```

## Built-in TCP Codecs

### Payshield HSM Codec

**Purpose:** Communicate with Thales Payshield HSM devices

**Configuration:**

```typescript
config: {
    default: {
        tcp: {
            host: 'hsm.example.com',
            port: 1500,
            namespace: ['hsm'],
            imports: ['realmname.payshield'],
            format: {
                size: '16/integer'        // Message size header
            },
            'realmname.payshield': {
                headerFormat: '6/string-left-zero'
            }
        }
    }
}
```

**Encode Handler:**

```typescript
// realmname/adapter/tcp/encode.ts
import {handler} from '@feasibleone/blong';

export default handler(({lib: {bitsyntax}, config}) =>
    function encode(message) {
        const command = message.command.padEnd(2, ' ');
        const data = message.data || '';
        const payload = command + data;

        // Build header with message length
        const header = bitsyntax.build(
            config.headerFormat,
            {value: payload.length}
        );

        return Buffer.concat([
            header,
            Buffer.from(payload, 'ascii')
        ]);
    }
);
```

**Decode Handler:**

```typescript
// realmname/adapter/tcp/decode.ts
import {handler} from '@feasibleone/blong';

export default handler(({lib: {bitsyntax}, config}) =>
    function decode(buffer) {
        const header = bitsyntax.parse(
            buffer.slice(0, 6),
            config.headerFormat
        );

        const payload = buffer.slice(6).toString('ascii');
        const command = payload.slice(0, 2);
        const data = payload.slice(2);

        return {
            command,
            data,
            length: header.value
        };
    }
);
```

### Custom Binary Protocol

**Example: Fixed-length message protocol**

```typescript
// encode.ts
export default handler(({lib: {bitsyntax}}) =>
    function encode(message) {
        // Build: 1 byte type, 2 byte length, variable data
        return bitsyntax.build(
            'type:8/integer, length:16/integer, data/binary',
            {
                type: message.type,
                length: message.data.length,
                data: Buffer.from(message.data)
            }
        );
    }
);

// decode.ts
export default handler(({lib: {bitsyntax}}) =>
    function decode(buffer) {
        const parsed = bitsyntax.parse(
            buffer,
            'type:8/integer, length:16/integer, data/binary'
        );

        return {
            type: parsed.type,
            data: parsed.data.toString()
        };
    }
);
```

## Implementing Custom Codecs

### HTTP Codec Pattern

Create `send` and `receive` handlers:

```typescript
// realmname/adapter/custom/send.ts
import {handler} from '@feasibleone/blong';

export default handler(({config}) =>
    function send(params, $meta) {
        // Transform parameters to HTTP request format
        return {
            method: 'POST',
            path: `/api/${$meta.method}`,
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': config.apiKey
            },
            body: JSON.stringify({
                version: '1.0',
                ...params
            })
        };
    }
);

// realmname/adapter/custom/receive.ts
import {handler} from '@feasibleone/blong';

export default handler(({errors}) =>
    function receive(response) {
        if (response.statusCode !== 200) {
            throw errors.apiError({
                status: response.statusCode,
                message: response.body
            });
        }

        const data = JSON.parse(response.body);
        return data.result;
    }
);
```

**Configuration:**

```typescript
config: {
    default: {
        http: {
            imports: ['realmname.custom'],
            'realmname.custom': {
                apiKey: 'secret-key'
            }
        }
    }
}
```

### TCP Codec Pattern

Create `encode` and `decode` handlers:

```typescript
// encode.ts - JavaScript object to Buffer
import {handler} from '@feasibleone/blong';

export default handler(({lib: {bitsyntax}}) =>
    function encode(message) {
        // Define wire format using bit syntax
        return bitsyntax.build(
            'messageId:32/integer, dataLength:16/integer, data/binary',
            {
                messageId: message.id,
                dataLength: message.payload.length,
                data: Buffer.from(message.payload)
            }
        );
    }
);

// decode.ts - Buffer to JavaScript object
import {handler} from '@feasibleone/blong';

export default handler(({lib: {bitsyntax}}) =>
    function decode(buffer) {
        const parsed = bitsyntax.parse(
            buffer,
            'messageId:32/integer, dataLength:16/integer, data/binary'
        );

        return {
            id: parsed.messageId,
            payload: parsed.data.toString()
        };
    }
);
```

## Codec Stacking

Multiple codecs can be layered:

```typescript
config: {
    default: {
        http: {
            imports: [
                'codec.openapi',          // Layer 1: REST protocol
                'codec.authentication',    // Layer 2: Add auth headers
                'codec.logging'            // Layer 3: Log requests
            ]
        }
    }
}
```

**Execution Order:**

- **Sending:** Bottom to top (logging → auth → openapi)
- **Receiving:** Top to bottom (openapi → auth → logging)

## Bit Syntax Patterns

The framework provides `bitsyntax` for binary protocols:

### Common Patterns

```typescript
// Integer types
'value:8/integer'        // 1 byte unsigned
'value:16/integer'       // 2 bytes unsigned
'value:32/integer'       // 4 bytes unsigned
'value:8/signed'         // 1 byte signed

// Strings
'text:10/string'         // 10 byte string
'command:2/string-left-zero'  // Left-padded with zeros

// Binary
'data/binary'            // Rest of buffer
'data:100/binary'        // Exactly 100 bytes

// Combinations
'header:4/string, length:16/integer, body/binary'
```

### Build Example

```typescript
const buffer = bitsyntax.build(
    'command:2/string, amount:32/integer, currency:3/string',
    {
        command: 'TX',
        amount: 100000,
        currency: 'USD'
    }
);
```

### Parse Example

```typescript
const message = bitsyntax.parse(
    buffer,
    'command:2/string, amount:32/integer, currency:3/string'
);
// Result: {command: 'TX', amount: 100000, currency: 'USD'}
```

## Best Practices

1. **Codec Separation:** Keep protocol logic separate from business logic
2. **Error Handling:** Convert protocol errors to domain errors
3. **Validation:** Validate decoded messages immediately
4. **Documentation:** Document wire format clearly
5. **Testing:** Test encode/decode round-trips
6. **Versioning:** Handle multiple protocol versions
7. **Logging:** Log at trace level for protocol debugging
8. **Stacking Order:** Place general codecs before specific ones
9. **Configuration:** Externalize protocol parameters
10. **Idempotency:** Design for safe retries

## Testing Codecs

```typescript
// Test encode/decode round-trip
export default handler(({handler: {encode, decode}}) => ({
    testCodec: () => [
        async function roundTrip(assert) {
            const original = {
                command: 'TX',
                data: 'test payload'
            };

            const encoded = encode(original);
            assert.ok(Buffer.isBuffer(encoded));

            const decoded = decode(encoded);
            assert.deepEqual(decoded, original);
        }
    ]
}));
```

## Examples from Codebase

- **OpenAPI:** `core/test/demo/server.ts` (codec.openapi configuration)
- **Payshield:** `core/test/payshield/adapter/tcp/`
- **JSON-RPC:** `core/test/demo/browser.ts`
- **Custom protocol:** `core/test/ctp/adapter/payshield/`
