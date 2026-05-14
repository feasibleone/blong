---
name: blong-test-sim
description: Simulate backend systems locally for Blong integration tests without requiring the real backend. Covers two patterns - OpenAPI-based HTTP simulation using orchestrator.openapi from @feasibleone/blong-openapi, and TCP-based simulation using adapter.tcp with listen=true. Use this skill whenever the real backend is unavailable, you need to stand up a local mock server for integration tests, or you want to exercise the full adapter and codec stack against a controlled simulator — even if the user just says 'mock the backend server' or 'simulate the HSM'.
---

# Simulating Backends for Tests

## Overview

When the real backend is unavailable but you still want to exercise the adapter and protocol code
(not just skip it with a mock orchestrator), you can simulate the backend with a local server.
The simulator runs inside the same process, activated only in `integration` mode.

Two built-in patterns cover the most common cases:

- **OpenAPI-based** — for HTTP services that have an OpenAPI spec
- **TCP-based** — for binary protocol devices like HSMs or payment terminals

## Simulating OpenAPI-based back ends

The simulation uses `orchestrator.openapi` from `@feasibleone/blong-openapi`. A `sim` layer
in the realm contains handler implementations that respond to requests, and the orchestrator
serves them via a local HTTP server on a known port. The real HTTP adapter is configured to
point to that local server when running in integration mode.

**How it works:**

1. The `sim` layer (auto-activated in integration mode) contains an `openapi` handler group
2. An `adapter.ts` handler in that group configures the `orchestrator.openapi` namespace
3. The mock handlers implement the API operations by method name
4. The HTTP adapter is configured to call the local mock server in integration mode

**File structure:**

```
time/
├── server.ts           # Realm — configures HTTP adapter URL in integration
├── adapter/
│   └── http.ts         # HTTP adapter with codec.openapi
├── orchestrator/
│   └── clock/
│       └── clockTimeGet.ts  # Calls time.get via HTTP adapter
└── sim/
    └── openapi/        # Handler group: time.openapi (matches orchestrator.openapi imports)
        ├── adapter.ts  # Configures openapi namespace (spec URLs + server URL)
        └── mocktimeGet.ts  # Handles GET /timezone/{area}/{location}
```

**`sim/openapi/adapter.ts`** — configures the mock namespace for `orchestrator.openapi`:

```typescript
export default handler(proxy => ({
    config: {
        api: {
            namespace: {
                mocktime: [
                    new URL('../../api/world-time.yaml', import.meta.url).href,
                    new URL('../../api/world-time.operations.yaml', import.meta.url).href,
                    {servers: [{url: 'http://localhost:8082'}]},
                ],
            },
        },
    },
    namespace: ['mocktime'],
}));
```

**`sim/openapi/mocktimeGet.ts`** — implements the mock handler:

```typescript
export default handler(
    proxy =>
        async function mocktimeGet({area, location}: {area: string; location: string}) {
            const date = new Date();
            return {
                abbreviation: 'UTC',
                client_ip: '127.0.0.1',
                datetime: date.toString(),
                timezone: `${area}/${location}`,
                unixtime: date.getTime(),
                utc_datetime: date.toISOString(),
            };
        },
);
```

**`time/server.ts`** — realm config points HTTP adapter to mock server in integration:

```typescript
integration: {
    http: {
        'codec.openapi': {
            namespace: {
                time: [
                    new URL('../api/world-time.yaml', import.meta.url).href,
                    new URL('../api/world-time.operations.yaml', import.meta.url).href,
                    {servers: [{url: 'http://localhost:8082'}]}, // → local mock server
                ],
            },
        },
    },
    sim: true,
},
```

**Suite `server.ts`** — include `blong-openapi` to provide the mock HTTP server:

```typescript
children: [
    async function openapi() {
        return import('@feasibleone/blong-openapi/server.ts');
    },
    './time',
],
config: {
    microservice: {
        openapi: {
            orchestrator: true,
            gateway: {port: 8082},   // Port where the mock server listens
        },
    },
},
```

A complete working example is in the [`core/blong-sim-api`](../../../core/blong-sim-api) package.

## Simulating TCP-based back ends

For binary protocol devices (e.g., an HSM using Payshield), the simulation uses a second
`adapter.tcp` instance with `listen: true`. This creates a TCP server on a shared port; the
regular client adapter connects to it in integration mode exactly as it would connect to the
real device.

**How it works:**

1. The `sim` layer (auto-activated in integration mode) contains a sim adapter using `adapter.tcp` with `listen: true`
2. A `receive` handler in the sim adapter's handler group processes incoming requests and sets `$meta.dispatch` to generate mock responses
3. The regular client adapter connects to the same port and calls the sim
4. Both adapters use the same codec for protocol compatibility

**File structure:**

```
payshield/
├── server.ts           # Realm — configures port for both adapter and sim
├── adapter/
│   ├── tcp.ts          # TCP client adapter (connects to HSM or sim)
│   └── tcp/            # Handler group: payshield.tcp
│       ├── echoRequestSend.ts          # Keepalive send handler
│       └── idleSendEventReceive.ts     # Idle send event handler
└── sim/
    ├── payshieldSim.ts  # TCP server adapter (listen: true) — the sim
    └── payshieldsim/   # Handler group: payshield.sim
        └── receive.ts  # Dispatches mock responses to incoming requests
```

**`sim/payshieldSim.ts`** — TCP server listening for connections:

```typescript
import {adapter} from '@feasibleone/blong';
import codec from 'ut-codec-payshield';
import log from '../log.ts';

export default adapter(blong => ({
    extends: 'adapter.tcp',
    activation: {
        default: {
            namespace: ['payshieldsim'],
            imports: ['payshield.sim'], // Handler group in sim/payshieldsim/
            maxReceiveBuffer: 4096,
            format: {
                codec, // Same codec as the client adapter
                maskedKeys: Object.keys(log.transform),
                headerFormat: '6/string-left-zero',
            },
            listen: true, // Acts as TCP server
        },
    },
}));
```

**`sim/payshieldsim/receive.ts`** — handles incoming requests:

```typescript
export default handler(
    proxy =>
        function receive(params: unknown, $meta: IMeta): unknown {
            if ($meta.mtid === 'request') {
                $meta.dispatch = (params: {data: unknown}, dispatchMeta: IMeta) => {
                    dispatchMeta.mtid = 'response';
                    switch (dispatchMeta.method) {
                        case 'echo':
                            return [{data: params.data, errorCode: '00'}, dispatchMeta];
                        case 'generateKey':
                            return [
                                {key: '0'.repeat(33), errorCode: '00', rest: Buffer.from('000')},
                                dispatchMeta,
                            ];
                    }
                };
            }
            return params;
        },
);
```

**`adapter/tcp.ts`** — client adapter using declarative `adapter.tcp`:

```typescript
import {adapter} from '@feasibleone/blong';
import codec from 'ut-codec-payshield';
import log from '../log.ts';

export default adapter(blong => ({
    extends: 'adapter.tcp',
    activation: {
        default: {
            namespace: ['payshieldport'],
            imports: ['payshield.tcp'],
            idleSend: 10000,
            maxReceiveBuffer: 4096,
            format: {
                codec,
                maskedKeys: Object.keys(log.transform),
                headerFormat: '6/string-left-zero',
            },
            listen: false, // Connects to the HSM (or sim in integration mode)
        },
    },
}));
```

**Realm config** — both adapters share the port; sim starts first (WELL_KNOWN_LAYERS order):

```typescript
// payshield/server.ts
config: {
    default: {
        tcp: {host: 'localhost', port: 1601},
        payshieldSim: {port: 1601},
    },
    microservice: {adapter: true, orchestrator: true},
    integration: {sim: true, test: true},
},
```

A complete working example is in the [`core/blong-sim-tcp`](../../../core/blong-sim-tcp) package.

## Choosing between simulation and mocking

| Situation | Use |
|---|---|
| Want to exercise the adapter and codec stack | **blong-test-sim** (this skill) |
| Backend is too complex to simulate locally | **blong-mock-test** (mock orchestrator) |
| Need a real service but can provision it in K8s | **blong-test-int** |

## Related skills

- **blong-test** — Writing test handlers (steps, assertions, parallel execution)
- **blong-test-api** — Setting up the `index.ts` test entry point
- **blong-mock-test** — Replacing adapters with mock handlers
- **blong-test-int** — Provisioning real backend services in Kubernetes for CI
