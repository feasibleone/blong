---
name: blong-rest
description: Implement REST APIs in Blong using OpenAPI/Swagger definitions. Framework defaults to JSON-RPC but supports REST for pre-defined APIs. Covers both server-side (gateway) and client-side (adapter) patterns with OpenAPI codec integration.
---

# Implementing REST APIs

## Overview

The Blong framework uses **JSON-RPC by default** for API endpoints based on validations and namespaces. For implementing **pre-defined REST APIs** (OpenAPI/Swagger-based), use the patterns described here.

## Purpose

- **REST Server:** Implement REST endpoints from OpenAPI/Swagger specs
- **REST Client:** Call external REST APIs using OpenAPI definitions
- **API Merging:** Combine multiple OpenAPI specs into single namespace
- **Standards Compliance:** Implement existing API contracts
- **Gateway Integration:** Expose REST endpoints at `/rest/` path

## Default: JSON-RPC

**Framework Default Behavior:**

- API handlers exposed as JSON-RPC endpoints at `/rpc/namespace/handler`
- Based on handler validations and semantic triple naming
- Automatic from handler definitions

**Example:**

```typescript
// Handler: userUserAdd
// Default endpoint: POST /rpc/user/user/add
```

## REST Pattern: When to Use

Use REST pattern when:

- Implementing pre-defined OpenAPI/Swagger APIs
- Integrating with external REST services
- Need specific HTTP methods (GET, POST, PUT, DELETE)
- API contract already exists
- REST compliance required

## Server-Side REST API

### Step 1: Define API Gateway

Use the `api()` function to define namespaces for each REST API:

```typescript
// realmname/gateway/api/entityname.ts
import {api} from '@feasibleone/blong';

export default api(() => ({
    namespace: {
        entityname: [
            './entityname.yaml',  // Local OpenAPI file
        ],
    },
}));
```

**With Multiple Sources:**

```typescript
// Merge multiple OpenAPI definitions
export default api(() => ({
    namespace: {
        agreement: [
            'https://raw.githubusercontent.com/org/service/main/swagger.json',  // Remote
            './agreement.yaml',  // Local additions/overrides
        ],
    },
}));
```

**Key Points:**

- Mounts REST endpoints at `/rest/{namespace}/...`
- Merges multiple OpenAPI specs into single namespace
- Only paths with `operationId` can have handlers
- Files processed in order (later files override earlier)

### Step 2: Define OpenAPI Specification

Create OpenAPI YAML file with `operationId` for each operation:

```yaml
# realmname/gateway/api/release.yaml
openapi: 3.0.3
info:
  title: Release API
  version: 1.0.0
  description: API for release management
servers:
  - url: ''
paths:
  /health:
    get:
      summary: Health check
      description: Check service health status
      operationId: HealthGet
      tags:
        - release
      responses:
        '200':
          description: Service is healthy
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    example: ok

  /release:
    get:
      summary: Get release information
      operationId: ReleaseReport
      tags:
        - release
      responses:
        '200':
          description: Release information
          content:
            application/json:
              schema:
                type: object

  /release/{id}:
    get:
      summary: Get specific release
      operationId: ReleaseGet
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Release details
```

**Using x-blong-method Extension:**

For simpler REST definitions without full OpenAPI spec:

```yaml
# realmname/gateway/api/discovery.yaml
paths:
  /participants/{Type}/{ID}:
    post:
      x-blong-method: ParticipantAdd
    get:
      x-blong-method: ParticipantGet
    put:
      x-blong-method: ParticipantEdit
    delete:
      x-blong-method: ParticipantRemove

  /participants/{Type}/{ID}/error:
    put:
      x-blong-method: ParticipantError
```

**Note:** `x-blong-method` is a framework extension that maps REST operations to handler names without requiring full OpenAPI specification.

### Step 3: Implement Handlers

Create handlers by prefixing `operationId` with namespace:

```typescript
// realmname/orchestrator/release/releaseHealthGet.ts
import {IMeta, handler} from '@feasibleone/blong';

type Handler = () => Promise<{
    status: string;
}>;

export default handler(
    () =>
        async function releaseHealthGet(
            params: Parameters<Handler>[0],
            $meta: IMeta
        ): ReturnType<Handler> {
            return {
                status: 'ok'
            };
        }
);
```

**Handler Naming Convention:**

- REST endpoint: `GET /rest/release/health`
- OpenAPI `operationId`: `HealthGet`
- Handler name: `release` + `HealthGet` = `releaseHealthGet`

**Examples:**

| Endpoint | operationId | Handler Name |
|----------|-------------|--------------|
| `GET /rest/release/health` | `HealthGet` | `releaseHealthGet` |
| `GET /rest/release/release` | `ReleaseReport` | `releaseReleaseReport` |
| `POST /rest/release/job/{jobName}` | `JobTrigger` | `releaseJobTrigger` |
| `GET /rest/agreement/quotes/{id}` | `QuoteGet` | `agreementQuoteGet` |

### Step 4: Configure Realm

Add gateway to realm configuration:

```typescript
// realmname/server.ts
import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    children: ['./error', './adapter', './orchestrator', './gateway'],
    config: {
        default: {
            orchestratorDispatch: {
                namespace: ['entity'],
                imports: ['realmname.entity'],
            }
        },
        microservice: {
            gateway: true,  // Enable gateway in microservice mode
        }
    }
}));
```

## Client-Side REST API

### Step 1: Configure HTTP Adapter

```typescript
// realmname/server.ts
import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        http: blong.type.Object({})
    }),
    children: ['./adapter', './orchestrator'],
    config: {
        default: {
            http: {
                imports: ['codec.openapi'],
                namespace: ['external'],
                'codec.openapi': {
                    namespace: {
                        external: [
                            'https://api.example.com/swagger.json',
                            './api/operations.yaml'
                        ]
                    }
                }
            }
        },
        dev: {
            http: {
                namespace: ['time', 'github'],
                'codec.openapi': {
                    namespace: {
                        time: [
                            '../api/world-time.yaml',
                            '../api/world-time.operations.yaml',
                            {
                                servers: [{
                                    url: 'http://localhost:8080/api'
                                }]
                            }
                        ],
                        github: ['../api/github.json']
                    }
                }
            }
        }
    }
}));
```

### Step 2: Implement HTTP Adapter

```typescript
// realmname/adapter/http.ts
import {adapter} from '@feasibleone/blong';

export default adapter(() => ({
    extends: 'adapter.http'
}));
```

### Step 3: Call REST API

Call using namespace + operationId:

```typescript
// realmname/orchestrator/subject/handlerName.ts
import {IMeta, handler} from '@feasibleone/blong';

export default handler(
    ({handler: {timeTimezoneGet}}) =>
        async function handlerName(params, $meta: IMeta) {
            // Calls GET /timezone/{area}/{location} from OpenAPI spec
            const result = await timeTimezoneGet({
                area: 'Europe',
                location: 'Sofia'
            }, $meta);

            return {
                timezone: result.timezone,
                datetime: result.datetime
            };
        }
);
```

## Complete Examples

### Server Example: Release API

**Gateway Definition:**

```typescript
// tools/release/gateway/api/release.ts
import {api} from '@feasibleone/blong';

export default api(() => ({
    namespace: {
        release: ['./release.yaml'],
    },
}));
```

**OpenAPI Spec:**

```yaml
# tools/release/gateway/api/release.yaml
openapi: 3.0.3
info:
  title: Release API
  version: 1.0.0
paths:
  /health:
    get:
      operationId: HealthGet
      responses:
        '200':
          description: Health status
  /release:
    get:
      operationId: ReleaseReport
      responses:
        '200':
          description: Release report
```

**Handler Implementation:**

```typescript
// tools/release/orchestrator/health/releaseHealthGet.ts
import {IMeta, handler} from '@feasibleone/blong';

type Handler = () => Promise<{status: string}>;

export default handler(
    () =>
        async function releaseHealthGet(
            params: Parameters<Handler>[0],
            $meta: IMeta
        ): ReturnType<Handler> {
            return {status: 'ok'};
        }
);
```

### Client Example: External API

**Configuration:**

```typescript
// demo/server.ts (excerpt)
config: {
    dev: {
        http: {
            namespace: ['time'],
            'codec.openapi': {
                namespace: {
                    time: [
                        '../api/world-time.yaml',
                        '../api/world-time.operations.yaml',
                        {servers: [{url: 'http://localhost:8080/rest/mocktime'}]}
                    ]
                }
            }
        }
    }
}
```

**Handler Using External API:**

```typescript
// demo/orchestrator/subject/subjectTime.ts
import {IMeta, handler} from '@feasibleone/blong';

export default handler(
    ({handler: {timeTimezoneGet}}) =>
        async function subjectTime(params, $meta: IMeta) {
            const result = await timeTimezoneGet({
                area: 'Europe',
                location: 'London'
            }, $meta);

            return result;
        }
);
```

### External API Integration Example

**Real-world pattern from ml/agreement:**

```typescript
// ml/agreement/gateway/api/agreement.ts
import {api} from '@feasibleone/blong';

export default api(() => ({
    namespace: {
        agreement: [
            // External Mojaloop API
            'https://raw.githubusercontent.com/mojaloop/quoting-service/feat/fx-impl/src/interface/swagger.json',
            // Local extensions with x-blong-method
            './agreement.yaml',
        ],
    },
}));
```

```yaml
# ml/agreement/gateway/api/agreement.yaml
paths:
  /quotes/{id}:
    get:
      x-blong-method: QuoteGet
    put:
      x-blong-method: QuoteEdit
  /quotes:
    post:
      x-blong-method: QuoteCreate
    get:
      x-blong-method: QuoteList
```

## File Structure

### Server-Side Structure

```
realmname/
├── server.ts                    # Realm configuration
├── gateway/
│   └── api/
│       ├── entity.ts           # API namespace definition
│       └── entity.yaml         # OpenAPI specification
└── orchestrator/
    ├── dispatch.ts
    └── entity/
        ├── entityOperationId1.ts   # Handler 1
        └── entityOperationId2.ts   # Handler 2
```

### Client-Side Structure

```
realmname/
├── server.ts                    # HTTP adapter config
├── adapter/
│   └── http.ts                 # HTTP adapter implementation
└── orchestrator/
    └── subject/
        └── handlerName.ts      # Uses external API
```

## Configuration Patterns

### Basic Gateway Configuration

```typescript
config: {
    default: {
        orchestratorDispatch: {
            namespace: ['entity'],
            imports: ['realmname.entity']
        }
    }
}
```

### HTTP Adapter Configuration

```typescript
config: {
    default: {
        http: {
            imports: ['codec.openapi'],
            namespace: ['external'],
            'codec.openapi': {
                namespace: {
                    external: ['./api/spec.yaml']
                }
            }
        }
    }
}
```

### Multiple Environments

```typescript
config: {
    default: {
        http: {
            imports: ['codec.openapi']
        }
    },
    dev: {
        http: {
            namespace: ['time'],
            'codec.openapi': {
                namespace: {
                    time: [
                        '../api/world-time.yaml',
                        {servers: [{url: 'http://localhost:8080'}]}
                    ]
                }
            }
        }
    },
    prod: {
        http: {
            namespace: ['time'],
            'codec.openapi': {
                namespace: {
                    time: [
                        '../api/world-time.yaml',
                        {servers: [{url: 'https://api.production.com'}]}
                    ]
                }
            }
        }
    }
}
```

## Best Practices

1. **Use operationId:** Every REST operation must have `operationId` for handler mapping
2. **Namespace Prefix:** Handler name = namespace + operationId (e.g., `releaseHealthGet`)
3. **Merge Specs:** Combine external APIs with local extensions
4. **x-blong-method:** Use for simpler REST definitions without full OpenAPI
5. **Server Override:** Use inline objects to override servers in different environments
6. **Type Definitions:** Define Handler types for automatic validation
7. **REST Path:** REST endpoints mounted at `/rest/{namespace}/...`
8. **JSON-RPC Fallback:** Handlers without REST config available at `/rpc/...`
9. **Gateway Layer:** Keep REST definitions in `gateway/api/` folder
10. **One API Per File:** Separate API definitions for clarity

## Comparison: JSON-RPC vs REST

### JSON-RPC (Default)

```typescript
// Handler: userUserAdd
// Endpoint: POST /rpc/user/user/add
// Body: {"username": "john", "email": "john@example.com"}
```

**Benefits:**

- Automatic from handler definitions
- No OpenAPI spec needed
- Simple configuration
- Consistent structure

### REST (Optional)

```yaml
# OpenAPI: POST /rest/user/users
operationId: UserAdd
```

```typescript
// Handler: userUserAdd (same name!)
// Endpoint: POST /rest/user/users
```

**Benefits:**

- Standards compliance
- HTTP verbs (GET, POST, PUT, DELETE)
- Path parameters
- Existing API contracts

### Both Available

Handlers can be exposed via both JSON-RPC and REST simultaneously:

- JSON-RPC: `/rpc/user/user/add`
- REST: `/rest/user/users` (if REST gateway configured)

## Common Patterns

### Health Check Endpoint

```yaml
paths:
  /health:
    get:
      operationId: HealthGet
      responses:
        '200':
          description: Service health
```

```typescript
export default handler(() =>
    async function realmHealthGet() {
        return {status: 'ok'};
    }
);
```

### CRUD Operations

```yaml
paths:
  /entities:
    get:
      operationId: EntityList
    post:
      operationId: EntityAdd
  /entities/{id}:
    get:
      operationId: EntityGet
    put:
      operationId: EntityEdit
    delete:
      operationId: EntityRemove
```

### External API Integration

```typescript
config: {
    default: {
        http: {
            imports: ['codec.openapi'],
            namespace: ['github', 'stripe'],
            'codec.openapi': {
                namespace: {
                    github: ['https://api.github.com/openapi.json'],
                    stripe: ['https://api.stripe.com/v1/openapi.yaml']
                }
            }
        }
    }
}
```

## Examples from Codebase

- **Server example:** `tools/release/gateway/api/`
- **Client example:** `core/test/demo/server.ts` and `orchestrator/clock/`
- **External API:** `ml/agreement/gateway/api/agreement.ts`
- **x-blong-method:** `ml/discovery/gateway/api/discovery.yaml`
- **Multiple specs:** `core/test/api/world-time.yaml` + `world-time.operations.yaml`

## Integration with Other Skills

- **[codec](../codec/)** - OpenAPI codec implementation details
- **[adapter](../adapter/)** - HTTP adapter configuration
- **[handler](../handler/)** - Handler implementation patterns
- **[validation](../validation/)** - Automatic validation from OpenAPI specs
- **[gateway](../layer/)** - Gateway layer organization
