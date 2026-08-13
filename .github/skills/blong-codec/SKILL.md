---
name: blong-codec
description: Implement protocols on top of transport layers in Blong. Includes HTTP codecs (OpenAPI, JSON-RPC, MLE) and TCP codecs (Payshield, ISO8583, SMPP). Handle serialization, deserialization, and request/response matching. Use this skill for any serialization/deserialization work, binary protocol wiring, or connecting to payment networks, HSM devices, or external systems with custom wire formats — even if the user doesn't say 'codec' explicitly.
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
activation: {
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
// In adapter/http.ts - co-located config
export default adapter(blong => ({
    extends: 'adapter.http',
    activation: {
        default: {
            namespace: ['external'],
            imports: ['codec.openapi'],
        },
        dev: {
            'codec.openapi': {
                namespace: {
                    // Namespace name: array of spec sources
                    time: [
                        './api/world-time.yaml', // Local file
                        './api/world-time.operations.yaml', // Additional ops
                        {
                            // Inline overrides
                            servers: [
                                {
                                    url: 'http://localhost:8080/rest/mocktime',
                                },
                            ],
                        },
                    ],
                    k8s: [
                        'https://k8s.io/api/apps.json', // Remote URL
                        'https://k8s.io/api/discovery.json',
                        'https://k8s.io/api/version.json',
                    ],
                    github: ['./api/github.json'],
                    // Custom x-blong configuration for incoming webhooks
                    dfsp: [
                        'https://api.example.com/swagger.json',
                        './gateway/api/custom.yaml',
                        {
                            host: 'localhost:8080',
                            basePath: '/rest/endpoint',
                            'x-blong': {
                                destination: 'webhookAdapter', // Adapter name
                                namespace: 'incoming', // Handler namespace
                            },
                        },
                    ],
                },
            },
        },
    },
}));
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
export default handler(
    ({handler: {externalGetUser}}) =>
        async function userUserFetch(params, $meta) {
            // externalGetUser corresponds to operationId in spec
            const user = await externalGetUser(
                {
                    userId: params.id,
                },
                {
                    ...$meta,
                    method: 'externalGetUser', // operationId
                },
            );
            return user;
        },
);
```

**OpenAPI Configuration:**

For complete OpenAPI configuration patterns including:

- `operationId` mapping to handlers
- `x-blong-method` custom extension for REST APIs
- Namespace configuration and spec file merging
- Request/response transformation patterns

See the **blong-rest** skill for comprehensive coverage.

**Codec-Specific Concerns:**

The OpenAPI codec focuses on protocol-level handler implementation:

```typescript
// Adapter encode handler - called before HTTP request
export default ({timeTimezoneGet}) =>
    encode(async ({area, location}) => ({
        url: `/timezone/${area}/${location}`,
        method: 'GET',
    }));

// Adapter decode handler - called after HTTP response
export default ({timeTimezoneGet}) =>
    decode(async response => ({
        abbreviation: response.body.abbreviation,
        datetime: response.body.datetime,
    }));
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
activation: {
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
export default handler(
    ({handler: {userUserAdd}}) =>
        async function createUser(params, $meta) {
            // Automatically calls /rpc/user/user/add
            const result = await userUserAdd(
                {
                    username: params.username,
                    email: params.email,
                },
                $meta,
            );
            return result;
        },
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
activation: {
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
activation: {
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

export default handler(
    ({lib: {bitsyntax}, config}) =>
        function encode(message) {
            const command = message.command.padEnd(2, ' ');
            const data = message.data || '';
            const payload = command + data;

            // Build header with message length
            const header = bitsyntax.build(config.headerFormat, {value: payload.length});

            return Buffer.concat([header, Buffer.from(payload, 'ascii')]);
        },
);
```

**Decode Handler:**

```typescript
// realmname/adapter/tcp/decode.ts
import {handler} from '@feasibleone/blong';

export default handler(
    ({lib: {bitsyntax}, config}) =>
        function decode(buffer) {
            const header = bitsyntax.parse(buffer.slice(0, 6), config.headerFormat);

            const payload = buffer.slice(6).toString('ascii');
            const command = payload.slice(0, 2);
            const data = payload.slice(2);

            return {
                command,
                data,
                length: header.value,
            };
        },
);
```

### Custom Binary Protocol

**Example: Fixed-length message protocol**

```typescript
// encode.ts
export default handler(
    ({lib: {bitsyntax}}) =>
        function encode(message) {
            // Build: 1 byte type, 2 byte length, variable data
            return bitsyntax.build('type:8/integer, length:16/integer, data/binary', {
                type: message.type,
                length: message.data.length,
                data: Buffer.from(message.data),
            });
        },
);

// decode.ts
export default handler(
    ({lib: {bitsyntax}}) =>
        function decode(buffer) {
            const parsed = bitsyntax.parse(
                buffer,
                'type:8/integer, length:16/integer, data/binary',
            );

            return {
                type: parsed.type,
                data: parsed.data.toString(),
            };
        },
);
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
                data: 'test payload',
            };

            const encoded = encode(original);
            assert.ok(Buffer.isBuffer(encoded));

            const decoded = decode(encoded);
            assert.deepEqual(decoded, original);
        },
    ],
}));
```

## Examples from Codebase

- **OpenAPI:** `core/blong-sim-api/time/sim/openapi/adapter.ts` (mock server config)
- **Payshield:** `core/blong-sim-tcp/payshield/adapter/tcp.ts` (declarative adapter.tcp)
- **JSON-RPC:** `core/test/demo/browser.ts`
- **Custom protocol:** `core/test/ctp/adapter/payshield/`
