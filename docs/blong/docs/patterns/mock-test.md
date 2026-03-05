# Server-side testing with mocks

When writing integration tests for handlers that call external systems (databases, downstream
services, transformation engines), you can replace those systems with lightweight mock handlers
that live in the `test` layer.  This gives you full in-process integration tests that are fast,
deterministic, and require no running infrastructure.

## How it works

The `test` layer is activated only in the `integration` configuration environment.  It adds two
orchestrators to the realm:

- **`mockDispatch`** – exposes a `mock` namespace backed by simple handler implementations in
  `test/mock/`.  These handlers simulate the external dependencies your business handlers rely on.
- **`testDispatch`** – exposes a `test` namespace backed by test scenario handlers in `test/test/`.
  Each test handler exercises one business handler and asserts on the results.

Because `remote: { canSkipSocket: true }` is set for the `integration` environment, every call
(`eip.*`, `mock.*`, `test.*`) stays in the same process and resolves through the in-process local
registry – no network or RPC transport needed.

## Folder structure

```
realmname/
├── orchestrator/
│   ├── eipDispatch.ts           # Business namespace
│   └── eip/                     # Business handlers that call mock.* handlers
│       └── eipMessageClaim.ts
└── test/                        # Test layer – activated only in "integration" mode
    ├── mockDispatch.ts          # Orchestrator: exposes "mock" namespace
    ├── testDispatch.ts          # Orchestrator: exposes "test" namespace
    ├── mock/                    # Handler group "realmname.mock"
    │   ├── ~.schema.ts          # IRemoteHandler type declarations for mock handlers
    │   ├── mockDataSave.ts
    │   ├── mockDataGet.ts
    │   └── mockItemProcess.ts
    └── test/                    # Handler group "realmname.test"
        ├── testEipClaim.ts
        └── testEipPipes.ts
```

## Step 1 – Write the mock handlers

Mock handlers are ordinary handlers that live in `test/mock/`.  They return hardcoded or
in-memory data that the business handlers depend on.

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

Optionally add a `~.schema.ts` to declare the mock handler signatures so the TypeScript
compiler and IDE can verify call sites:

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

## Step 2 – Add the mock orchestrator

`mockDispatch` wires the mock handler group to the `mock` namespace.
It is only activated in the `integration` environment.

```ts
// realmname/test/mockDispatch.ts
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
// realmname/test/testDispatch.ts
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
They live in `test/test/` and follow the [test handler pattern](./test).

```ts
// realmname/test/test/testEipClaim.ts
import {type IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(
    ({lib: {group}, handler: {eipMessageClaim}}) => ({
        testEipClaim: ({name = 'eip claim'}: {name?: string}, $meta: IMeta) =>
            group(name)([
                async function claimCheck(
                    assert: typeof Assert,
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

## Step 5 – Activate the test layer in server.ts

Enable the `test` layer for the `integration` environment in the realm `server.ts`:

```ts
// realmname/server.ts
import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./test'],           // include the test layer
    config: {
        default: {},
        integration: {
            test: true,             // activate the test layer
        },
        microservice: {
            orchestrator: true,
        },
    },
}));
```

## Step 6 – Configure the root server for in-process calls

In the root `server.ts` (the one loaded by the test runner), set
`remote.canSkipSocket: true` so all calls stay in-process:

```ts
// server.ts
import {server} from '@feasibleone/blong';

export default server(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./realmname'],
    config: {
        default: {},
        integration: {
            remote: {canSkipSocket: true},      // ← in-process calls
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

const realm = await load(server, 'realmname', 'realmname', [
    'microservice', 'dev', 'test', 'integration',
]);
await realm.start();
await tap.test('my realm', async test => {
    await realm.test(test);
});
await realm.stop();
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

See `core/blong-eip/` for a complete working implementation:

- Business handlers: `eip/orchestrator/eip/`
- Mock handlers: `eip/test/mock/`
- Test handlers: `eip/test/test/`
- Mock orchestrator: `eip/test/mockDispatch.ts`
- Test orchestrator: `eip/test/testDispatch.ts`
- Realm activation: `eip/server.ts`
- Root server: `server.ts`
- Test runner: `index.test.ts`

## See also

- [EIP patterns](./eip) – the patterns that are tested using this approach
- [Test handler pattern](./test) – general test handler documentation
- [Handler pattern](./handler) – how business handlers are written
