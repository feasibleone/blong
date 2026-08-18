# Server-side testing with mocks

When writing integration tests for handlers that call external systems (databases, downstream
services, transformation engines), you can replace those systems with lightweight mock handlers
that live in the `server/test` layer.  This gives you full in-process integration tests that are
fast, deterministic, and require no running infrastructure.

## How it works

The `server/test` layer is activated under the `integration` intent.  It adds two
orchestrators to the realm:

- **`mockDispatch`** – exposes a `mock` namespace backed by simple handler implementations in
  `server/test/mock/`.  These handlers simulate the external dependencies your business handlers
  rely on.
- **`testDispatch`** – exposes a `test` namespace backed by test scenario handlers in
  `server/test/test/`.  Each test handler exercises one business handler and asserts on the
  results.

When the `integration` intent is active, the framework automatically sets `remote.canSkipSocket: true`,
so every call (`eip.*`, `mock.*`, `test.*`) stays in the same process and resolves through the
in-process local registry – no network or RPC transport needed.

## Folder structure

```
realmname/
├── orchestrator/
│   ├── eipDispatch.ts           # Business namespace
│   └── eip/                     # Business handlers that call mock.* handlers
│       └── eipMessageClaim.ts
└── server/                      # Server platform
    └── test/                    # Server test layer – auto-activated under "integration"
        ├── mockDispatch.ts      # Orchestrator: exposes "mock" namespace
        ├── testDispatch.ts      # Orchestrator: exposes "test" namespace
        ├── mock/                # Handler group "realmname.mock"
        │   ├── ~.schema.ts      # IRemoteHandler type declarations for mock handlers
        │   ├── mockDataSave.ts
        │   ├── mockDataGet.ts
        │   └── mockItemProcess.ts
        └── test/                # Handler group "realmname.test"
            ├── testEipClaim.ts
            └── testEipPipes.ts
```

## Step 1 – Write the mock handlers

Mock handlers are ordinary handlers that live in `test/mock/`.  They return hardcoded or
in-memory data that the business handlers depend on.

```ts
// realmname/server/test/mock/mockDataSave.ts
import {type IMeta, handler} from '@feasibleone/blong';

export default handler(
    () =>
        async function mockDataSave(data: unknown, $meta: IMeta): Promise<{id: string}> {
            return {id: 'mock-id'};
        },
);
```

```ts
// realmname/server/test/mock/mockDataGet.ts
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

Optionally add a `~.schema.ts` to declare the mock handler signatures so the TypeScript
compiler and IDE can verify call sites:

```ts
// realmname/server/test/mock/~.schema.ts
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

## Step 2 – Add the mock orchestrator

`mockDispatch` wires the mock handler group to the `mock` namespace.
It is only activated in the `integration` environment.

```ts
// realmname/server/test/mockDispatch.ts
import {orchestrator} from '@feasibleone/blong';

export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {},
        integration: {
            namespace: ['mock'],
            imports: ['realmname.mock'],
        },
    },
}));
```

## Step 3 – Add the test orchestrator

`testDispatch` wires the test handler group to the `test` namespace.

```ts
// realmname/server/test/testDispatch.ts
import {orchestrator} from '@feasibleone/blong';

export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {},
        integration: {
            namespace: ['test'],
            imports: ['realmname.test'],
        },
    },
}));
```

## Step 4 – Write the test handlers

Test handlers call the real business handler and assert on the results.
They live in `server/test/test/` and follow the [test handler pattern](./test).

```ts
// realmname/server/test/test/testEipClaim.ts
import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

export default handler(
    ({lib: {group}, handler: {eipMessageClaim}}) => ({
        testEipClaim: ({name = 'eip claim'}: {name?: string}, $meta: IMeta) =>
            group(name)([
                async function claimCheck(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const result = (await eipMessageClaim(
                        {large: 'payload', sensitive: true},
                        $meta,
                    )) as Record<string, unknown>;
                    assert.equal(result.id, 'mock-id', 'claim ID returned');
                    assert.equal(result.payload, 'stored-payload', 'stored payload retrieved');
                },
            ]),
    }),
);
```

## Step 5 – Test layer activation

The `server/test` layer is **auto-discovered** and activates under the `integration` intent — no
`children: ['./test']` and no `integration: {test: true}` block are needed in the realm `server.ts`.
The mock/test orchestrators co-locate their own `activation` (as in Steps 2-3).

## Step 6 – Enable tests in the root server

In the root `server.ts` (loaded by the test runner), set the servers to listen on random ports and
list the test entry-points in `watch.test`. The framework automatically sets `remote.canSkipSocket:
true` for the `integration` intent — no need to add it manually:

```ts
// server.ts
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
                test: ['test.eip.claim', 'test.eip.pipes'],  // test entry-points
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

## How the handler proxy resolves mock calls

Business handlers receive a `handler` proxy in their factory argument:

```ts
export default handler(
    ({handler: {mockDataSave, mockDataGet}}) =>
        async function eipMessageClaim(params: unknown, $meta: IMeta) {
            const {id} = await mockDataSave(params, $meta);
            return mockDataGet({id}, $meta);
        },
);
```

In production the orchestrator `imports` config points to a real adapter.
In the `integration` environment, `mockDispatch` registers `mockDataSave` and `mockDataGet`
under the `mock` namespace, and the `handler` proxy resolves those names through the local
registry.  No code in the business handler changes between environments.

## Full example

See `core/blong-eip/` for a complete working implementation (modern layout: server-side mock/test
handlers under `server/test/`):

- Business handlers: `eip/orchestrator/eip/`
- Mock handlers: `eip/server/test/mock/`
- Test handlers: `eip/server/test/test/`
- Mock orchestrator: `eip/server/test/mockDispatch.ts`
- Test orchestrator: `eip/server/test/testDispatch.ts`
- Test runner: `index.test.ts`

## See also

- [EIP patterns](./eip) – the patterns that are tested using this approach
- [Test handler pattern](./test) – general test handler documentation
- [Handler pattern](./handler) – how business handlers are written
