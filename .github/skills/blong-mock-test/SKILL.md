---
name: blong-mock-test
description: Write server-side integration tests using mock handlers in Blong. Mock handlers in test/mock/ simulate external systems (databases, services). mockDispatch and testDispatch orchestrators in the test layer wire the mocks and tests together. Use this skill whenever the user wants to test without real infrastructure, mentions mocking adapters or external services, or needs server-side integration testing with deterministic mock data.
---

# Server-Side Testing with Mocks

## Overview

When business handlers call external systems (a database, a downstream service, an HSM), you replace
those systems with lightweight mock handlers that live in the `test` layer. All code stays
in-process – no running infrastructure is required.

The pattern uses two orchestrators in the `test` layer:

- **`mockDispatch`** – registers mock handlers under the `mock` namespace so that business handlers
  can call them via the `handler` proxy.
- **`testDispatch`** – registers test scenario handlers under the `test` namespace so that the
  framework's watch/test runner can call them.

## Purpose

- **Fast tests** – everything runs in the same process, no network latency
- **Deterministic** – mock handlers return controlled, predictable data
- **Zero infrastructure** – no database, no external service needed
- **Environment isolation** – test layer is only active in `integration` mode
- **Swap mocks for real** – in production the orchestrator `imports` points to a real adapter

## File structure

```
realmname/
├── orchestrator/
│   ├── eipDispatch.ts           # Business namespace (production)
│   └── eip/                     # Business handlers
│       └── eipMessageClaim.ts
└── test/                        # Test layer (activated in "integration" mode only)
    ├── mockDispatch.ts          # Orchestrator → "mock" namespace
    ├── testDispatch.ts          # Orchestrator → "test" namespace
    ├── mock/                    # Handler group "realmname.mock"
    │   ├── ~.schema.ts          # IRemoteHandler type declarations for mock handlers
    │   ├── mockDataSave.ts
    │   └── mockDataGet.ts
    └── test/                    # Handler group "realmname.test"
        └── testEipClaim.ts
```

## Step 1 – Write mock handlers

Mock handlers are ordinary `handler()` exports in `test/mock/`. They return hardcoded or in-memory
data.

```ts
// realmname/test/mock/mockDataSave.ts
import {type IMeta, handler} from '@feasibleone/blong';

export default handler(
    () =>
        async function mockDataSave(data: unknown, $meta: IMeta): Promise<{id: string}> {
            return {id: 'mock-id'};
        },
);
```

```ts
// realmname/test/mock/mockDataGet.ts
import {type IMeta, handler} from '@feasibleone/blong';

export default handler(
    () =>
        async function mockDataGet(
            {id}: {id: string},
            $meta: IMeta,
        ): Promise<{id: string; payload: unknown}> {
            return {id, payload: 'stored-payload'};
        },
);
```

### TypeScript declarations for mock handlers

Add a `~.schema.ts` to declare the mock handler signatures. This lets the TypeScript compiler check
call sites in business handlers.

```ts
// realmname/test/mock/~.schema.ts
import {validationHandlers} from '@feasibleone/blong';

export default validationHandlers({});

declare module '@feasibleone/blong' {
    interface IRemoteHandler {
        mockDataSave<T = Promise<{id: string}>>(data: unknown, $meta: IMeta): T;
        mockDataGet<T = Promise<{id: string; payload: unknown}>>(
            params: {id: string},
            $meta: IMeta,
        ): T;
    }
}
```

## Step 2 – Add `mockDispatch`

`mockDispatch` wires the `test/mock/` handler group to the `mock` namespace. It is only active in
the `integration` environment (the `default` activation is empty).

```ts
// realmname/test/mockDispatch.ts
import {orchestrator} from '@feasibleone/blong';

export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    validation: blong.type.Object({
        namespace: blong.type.Optional(blong.type.Array(blong.type.String())),
        imports: blong.type.Optional(
            blong.type.Union([blong.type.String(), blong.type.Array(blong.type.String())]),
        ),
    }),
    activation: {
        default: {},
        integration: {
            namespace: ['mock'],
            imports: ['realmname.mock'],
        },
    },
}));
```

## Step 3 – Add `testDispatch`

`testDispatch` wires the `test/test/` handler group to the `test` namespace.

```ts
// realmname/test/testDispatch.ts
import {orchestrator} from '@feasibleone/blong';

export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    validation: blong.type.Object({
        namespace: blong.type.Optional(blong.type.Array(blong.type.String())),
        imports: blong.type.Optional(
            blong.type.Union([blong.type.String(), blong.type.Array(blong.type.String())]),
        ),
    }),
    activation: {
        default: {},
        integration: {
            namespace: ['test'],
            imports: ['realmname.test'],
        },
    },
}));
```

## Step 4 – Write test handlers

Test handlers call the real business handler and assert on the results. They live in `test/test/`
and follow the [blong-test](../test) pattern.

> **Canonical placement:** the reference realms place server-side tap tests in `server/test/`
> (`core/blong-access/server/test/test/`). The `test/test/` + `testDispatch` layout shown here still
> works (the framework auto-provisions a `testDispatch` when a server `test/` folder has no
> `testDispatch.ts`), but `server/test/` is the standard going forward.

```ts
// realmname/test/test/testEipClaim.ts
import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

export default handler(({lib: {group}, handler: {eipMessageClaim}}) => ({
    testEipClaim: ({name = 'claim check'}: {name?: string}, $meta: IMeta) =>
        group(name)([
            async function claimCheck(assert: IAssert, {$meta}: {$meta: IMeta}) {
                const result = (await eipMessageClaim(
                    {large: 'payload', sensitive: true},
                    $meta,
                )) as Record<string, unknown>;
                assert.equal(result.id, 'mock-id', 'claim ID returned');
                assert.equal(result.payload, 'stored-payload', 'stored payload retrieved');
            },
        ]),
}));
```

## Step 5 – Activate the test layer

In the realm's `server.ts`, activate the `test` layer for `integration` mode:

```ts
// realmname/server.ts
import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./test'],
    config: {
        default: {},
        integration: {
            test: true,
        },
        microservice: {
            orchestrator: true,
        },
    },
}));
```

## Step 6 – Enable tests in the root server

In the root `server.ts` (loaded by the test runner), set the servers to listen on random ports and
list the test entry-points in `watch.test`:

```ts
// server.ts (root)
import {server} from '@feasibleone/blong';

export default server(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./realmname'],
    config: {
        default: {
            rpcServer: {
                port: 0,
            },
            gateway: {
                port: 0,
            },
        },
        integration: {
            watch: {
                test: ['test.eip.claim'], // called by realm.test()
            },
        },
    },
}));
```

## Step 7 – Write the test runner

```ts
// index.test.ts
import load from '@feasibleone/blong-gogo';
import tap from 'tap';

import server from './server.ts';

const platform = await load(server, 'suite-name', 'suite-name', [
    'microservice',
    'integration',
    'dev',
]);
await platform.start();
await tap.test('my suite', async test => {
    await platform.test(test);
});
await platform.stop();
```

## How mock handlers are resolved

Business handlers receive a `handler` proxy:

```ts
export default handler(
    ({handler: {mockDataSave, mockDataGet}}) =>
        async function eipMessageClaim(params: unknown, $meta: IMeta) {
            const {id} = await mockDataSave(params, $meta); // resolved via "mock" namespace
            return mockDataGet({id}, $meta);
        },
);
```

In production, `eipDispatch` imports the handler group from a real SQL adapter. In integration
tests, `mockDispatch` registers `mockDataSave` / `mockDataGet` under the `mock` namespace and the
same `handler` proxy resolves them in-process. No code in the business handler changes between
environments.

## Mock handler patterns

### Stateless mock (hardcoded response)

```ts
export default handler(
    () =>
        async function mockExternalService(
            params: unknown,
            $meta: IMeta,
        ): Promise<{status: string}> {
            return {status: 'ok'};
        },
);
```

### Stateful mock (in-memory store)

```ts
export default handler(() => {
    const store = new Map<string, unknown>();
    return async function mockDataSave(data: unknown, $meta: IMeta): Promise<{id: string}> {
        const id = String(Date.now());
        store.set(id, data);
        return {id};
    };
});
```

### Conditional mock (simulate errors)

```ts
export default handler(({errors}) => {
    const _errors = errors({notFound: 'Item not found: {id}'});
    return async function mockDataGet({id}: {id: string}, $meta: IMeta): Promise<unknown> {
        if (id === 'missing') throw _errors.notFound({params: {id}});
        return {id, payload: 'data'};
    };
});
```

## Directory naming conventions

| Folder       | Namespace | Handler prefix | Purpose                        |
| ------------ | --------- | -------------- | ------------------------------ |
| `test/mock/` | `mock`    | `mock`         | Simulate external dependencies |
| `test/test/` | `test`    | `test`         | Test scenarios & assertions    |

## Complete example

See `core/blong-eip/` for a working reference:

- Mock handlers: `eip/test/mock/`
- Test handlers: `eip/test/test/`
- `mockDispatch`: `eip/test/mockDispatch.ts`
- `testDispatch`: `eip/test/testDispatch.ts`
- Realm activation: `eip/server.ts`
- Root server: `server.ts`
- Test runner: `index.test.ts`

## See also

- **blong-test** – general test handler patterns and parallel execution
- **blong-eip** – EIP pattern handlers that use this testing approach
- **blong-handler** – how business handlers are written
- [Server-side testing with mocks](../../docs/blong/docs/patterns/mock-test) – conceptual
  documentation
