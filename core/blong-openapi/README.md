<!-- markdownlint-disable MD033 MD041 -->
<div align="center">

![Blong logo](https://raw.githubusercontent.com/feasibleone/blong/refs/heads/main/img/manta200.png)

# Blong OpenAPI

OpenAPI/Swagger integration for the Blong framework

[![docs](https://raw.githubusercontent.com/feasibleone/blong/refs/heads/main/img/button.png)](https://feasibleone.github.io/blong-docs/)

</div>

## Overview

`@feasibleone/blong-openapi` provides seamless integration with external REST
APIs using OpenAPI 2.0/3.0 (Swagger) definitions. It automatically generates
type-safe handlers from API specifications, enabling you to call external
services without writing manual HTTP request code.

## Features

- **Automatic Handler Generation**: Parse OpenAPI/Swagger definitions and
  generate callable handlers
- **Type-Safe Integration**: Use `operationId` from API specs as handler names
- **Multiple API Support**: Configure multiple API namespaces in a single orchestrator
- **URL & File Support**: Load specifications from local files or remote URLs
- **Flexible Configuration**: Override servers, paths, and other API properties
- **Microservice Ready**: Deployable as standalone service or part of monolith

## Installation

```bash
# Using pnpm (recommended)
pnpm add @feasibleone/blong-openapi

# Using npm
npm install @feasibleone/blong-openapi
```

## Quick Start

### 1. Create OpenAPI Orchestrator

```typescript
// realmname/orchestrator/openapi.ts
import {orchestrator} from '@feasibleone/blong';

export default orchestrator(() => ({
    extends: 'orchestrator.openapi',
}));
```

### 2. Configure API Namespace

```typescript
// realmname/server.ts
import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        openapi: blong.type.Object({}),
    }),
    children: ['./orchestrator'],
    config: {
        default: {
            openapi: {
                logLevel: 'info',
                namespace: ['api'],
                api: {
                    namespace: {
                        weather: [
                            './definitions/weather-api.yaml',
                            './definitions/weather-operations.yaml',
                        ],
                    },
                },
            },
        },
    },
}));
```

### 3. Call the API

Handlers are automatically generated using the pattern: `namespace + operationId`

```typescript
// In your orchestrator/adapter
const result = await this.bus.weatherGetCurrentWeather({
    params: {city: 'London'},
});
```

## Configuration

### Basic Configuration

```yaml
openapi:
  logLevel: info                    # Log level for the orchestrator
  namespace: ['api']                # Namespace prefix for calling handlers
  api:
    namespace:
      weather:                      # API namespace identifier
        - ./api/weather.yaml        # OpenAPI/Swagger definition (local)
        - https://api.example.com/swagger.json  # or remote URL
```

### Advanced Configuration

Configure multiple APIs with custom settings:

```yaml
openapi:
  api:
    namespace:
      # External API with custom server override
      payment:
        - https://payment-api.example.com/openapi.json
        - host: 'api.production.com'
          basePath: '/v2'
          x-blong:
            destination: 'paymentService'
            namespace: 'payment'

      # Kubernetes API integration
      k8s:
        - https://kubernetes.io/api/v1/swagger.json
        - servers:
            - url: 'https://k8s-cluster:6443'
```

### Multiple Definition Files

Split large API definitions across multiple files:

```yaml
api:
  namespace:
    time:
      - ./api/world-time.yaml              # Base OpenAPI definition
      - ./api/world-time.operations.yaml   # Additional operationId mappings
      - servers:
          - url: 'http://worldtimeapi.org'
```

## Usage Patterns

### With HTTP Adapter

Combine with HTTP adapter for external API integration:

```typescript
// adapter/weather.ts
import {adapter} from '@feasibleone/blong';

export default adapter(() => ({
    extends: 'adapter.http',
}));
```

```typescript
// server.ts
config: {
    default: {
        weather: {
            imports: ['codec.openapi'],
            namespace: ['weather'],
            'codec.openapi': {
                namespace: {
                    weather: ['./api/weather.yaml']
                }
            }
        }
    }
}
```

### Microservice Deployment

Deploy as standalone microservice:

```yaml
microservice:
  orchestrator: true      # Enable orchestrator mode
  gateway:
    port: 8081           # Expose on port 8081
```

### Custom Operation IDs

If API doesn't define `operationId`, create mapping file:

```yaml
# weather-operations.yaml
paths:
  /weather/current:
    get:
      operationId: getCurrentWeather
      x-blong-method: weatherCurrent    # Alternative method name
```

## Handler Naming Convention

Generated handlers follow the pattern: `{namespace}{operationId}`

**Examples:**

| Namespace | operationId | Handler Name |
| ----------- | ------------- | -------------- |
| weather | GetForecast | `weatherGetForecast` |
| payment | CreateTransaction | `paymentCreateTransaction` |
| k8s | listNamespaces | `k8slistNamespaces` |

Names are case-sensitive and trimmed of whitespace.

## Integration Examples

### REST API Client

See [REST Client Pattern](https://feasibleone.github.io/blong-docs/patterns/rest/#client) in docs

### Webhook Integration

```typescript
// adapter/webhook.ts
import {adapter} from '@feasibleone/blong';

export default adapter(() => ({
    extends: 'adapter.webhook',
}));
```

Configure incoming webhooks with OpenAPI definitions:

```yaml
webhook:
  imports: ['codec.openapi']
  'codec.openapi':
    namespace:
      github:
        - ./api/github-webhooks.yaml
```

## Related Packages

- **[@feasibleone/blong](https://www.npmjs.com/package/@feasibleone/blong)** -
  Core framework
- **[@feasibleone/blong-gogo](https://www.npmjs.com/package/@feasibleone/blong-gogo)** -
  Contains base `orchestrator.openapi` and `codec.openapi`
- **[openapi-types](https://www.npmjs.com/package/openapi-types)** - TypeScript
  types for OpenAPI

## Documentation

- **[Blong Documentation](https://feasibleone.github.io/blong-docs/)**
- **[OpenAPI Codec Pattern](https://feasibleone.github.io/blong-docs/patterns/codec/#openapi)**
- **[REST API Pattern](https://feasibleone.github.io/blong-docs/patterns/rest/)**
- **[Adapter Pattern](https://feasibleone.github.io/blong-docs/patterns/adapter/)**

## Example Projects

See the [test/api](../../core/test/api/) folder for working examples with
world-time API integration.
