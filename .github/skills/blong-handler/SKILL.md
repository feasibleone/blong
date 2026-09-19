---
name: blong-handler
description:
    Create API handlers and library functions in Blong using semantic triple naming
    (subjectObjectPredicate). Handlers implement business operations, protocol tasks, or reusable
    logic. Use this skill whenever you're writing any function in a Blong realm — API endpoints,
    library helpers, adapter logic, or test steps. Even if the user just says 'add a function' or
    'implement this logic in Blong', use this skill.
---

# Implementing Handlers

## [CRITICAL_GUARDRAILS]

- **Triple naming.** `subjectObjectPredicate`; file = export = wire name. Flag violations.
- **Never import other handlers.** Use `handler: {}` proxy (IoC). Direct imports break IoC + hot
  reload.
- **Always forward `$meta`** as the 2nd arg on every downstream call.
- **One handler per file.** Library functions get their own files too.
- **Standard predicates prioritized.** `get`/`find`/`add`/`edit`/`remove`/`merge`;
  `insert`/`update`/`delete`.
- **Two-word properties.** `userName` not `name`; `customerId` not `id`.
- **Do not reach past the adapter.** Your own client is out — `fetch`, a socket, an SDK: the
  endpoint, credentials, transport, timeouts and error mapping a deployment configured belong to the
  port. `exec` is the port's own call rather than a bypass — see _Conversions_ below, which is also
  where to prefer `send` / `receive` when a group's methods share a shape.

Canonical framework rules + `[ARCHETYPE: HANDLER]` type signature:
`.github/skills/_shared/conventions.md`.

## Conversions — how a group talks to its adapter

A **conversion** is the port's own seam. The loop runs it around _every_ method of the group, so the
protocol lives in one place instead of in each handler — and that is the point to check **before**
writing any call to an external system.

A handler that opens its own connection — `fetch`, a socket, an SDK — has re-implemented the adapter
it is attached to, and quietly opted out of everything that adapter owns: the endpoint the
deployment configured, the credentials, the transport and its TLS, the timeouts, the retries, the
error mapping, and any interceptor above it. The two usual symptoms are the ones to look for in
review:

- **a long handler** — request building, status checks and payload parsing repeated per method;
- **a misaligned one** — your own client at an endpoint nobody configured, in a realm whose _other_
  calls go through a port.

`exec` is not the thing to avoid — it _is_ the adapter's call, and `super.exec` is how a handler
reuses the default (the automatic CRUD, for one). What a conversion buys is _shape_: when a group's
methods differ only in the path they ask for, six handlers that each build a request say the same
thing six times.

The adapter side of the same rule — which base adapter to extend, what a port owns — is
**blong-adapter**.

| Conversion                               | Signature                       | Runs                                  | Holds                                                 |
| ---------------------------------------- | ------------------------------- | ------------------------------------- | ----------------------------------------------------- |
| `send`                                   | `(params, $meta, context)`      | before the method                     | the outgoing request: parameters, descriptor, framing |
| `receive`                                | `(result, $meta, context)`      | after the method                      | the incoming answer: unwrap, decode, check the status |
| `encode`                                 | `(data, $meta, context, log)`   | before the write (streams)            | object → Buffer                                       |
| `decode`                                 | `(buffer, $meta, context, log)` | after the read (streams)              | Buffer → object                                       |
| `exec`                                   | the adapter's own               | when **no** method handler exists     | the call itself (HTTP, knex, …)                       |
| `ready`                                  | `()`                            | when the port is up                   | what only exists at run time                          |
| `idleSend` / `idleReceive` / `drainSend` | —                               | keep-alive, idle timeout, empty queue | heartbeats                                            |

### How a conversion is found

The port loop probes **method, then mtid, then nothing**:

1. `<subject>.<object>.<predicate>.<mtid>.<type>` — one method's, e.g.
   `blong.flow.find.request.send`;
2. `<mtid>.<type>` — every request or every response, e.g. `request.send`, `response.receive`;
3. `<type>` — the group's generic `send` / `receive`.

(An opcode-level probe sits between the first and the second, for the stream adapters whose packets
carry one; a URL port never needs it.)

**Which level you write at is your choice**, and it is the choice this order exists to give you: one
`send` when a group's methods share a shape, one per method when each asks for something different,
and the same for the answer — while a codec that already builds the request may need none at all.

So **file name = export = conversion name**, exactly as with handlers: `blongFlowFindRequestSend.ts`
exports `blongFlowFindRequestSend` (which _is_ `blong.flow.find.request.send`), and one shared
answer path is `responseReceive.ts` exporting `responseReceive` (`response.receive`). They are
attached by the port's `imports`, like any other group.

### What `send` returns — HTTP as the example

For an HTTP port (`adapter.http` and everything extending it), `send` returns the request the base
`exec` will make and `receive` is handed got's response back. That descriptor _is_ the whole
protocol surface a URL port needs — no client, no `fetch`, no address. The two files below are one
shape of it: a request per method, and a single answer path shared by all six reads.

```typescript
// adapter/semlog/blongFlowGetRequestSend.ts — one method's request
export default handler(
    () =>
        function blongFlowGetRequestSend(params: {reference: string}) {
            return {
                method: 'GET',
                path: `/flows/${encodeURIComponent(params.reference)}/diagram`,
                responseType: 'json',
            };
        },
);

// adapter/semlog/responseReceive.ts — one answer path for the whole group
export default handler(
    ({errors}) =>
        function responseReceive(response: {statusCode: number; body: unknown}) {
            if (response.statusCode < 200 || response.statusCode >= 300) {
                throw errors.semlogRefused({statusCode: response.statusCode});
            }
            return response.body;
        },
);
```

The shape is the transport's: a stream port's `send` transforms the payload and `encode` / `decode`
frame it (`test/blong-sim-tcp/payshield/adapter/tcp/echoRequestSend.ts`), and a port over a driver
(knex, mongodb, s3) leaves the call to `exec` with the connection it was given.

### A group that is only a protocol has no method handlers

`send`'s result is what the method handler would receive, so a handler for a pure read could only
hand the descriptor back to `exec` — the detour the conversions remove. With no handler at all, the
port's `handle()` falls back to the adapter's own `exec`, the router still reaches the port through
its namespace, and the methods are declared by the **gateway** layer's `validation` files (route +
parameters). `core/blong-realm/adapter/semlog/` is a worked example: six `<method>RequestSend`
conversions, one `responseReceive`, no handlers, and no HTTP code in the realm at all.

### Conversions stack

A later group's conversion calls `super.send` / `super.receive` to reach the one beneath it — that
is how the MLE codec wraps the JSON-RPC codec. Return the packet unchanged when there is nothing
beneath:

```typescript
export default handler(() => ({
    async send(params, $meta) {
        params = normalize(params);
        return super.send ? super.send(params, $meta) : params;
    },
    async receive(result, $meta) {
        const data = super.receive ? await super.receive(result, $meta) : result;
        return decorate(data);
    },
}));
```

Worked examples: `core/blong-gogo/src/codec/adapter/jsonrpc/send.ts` and `receive.ts` (the HTTP
descriptor and the answer, one pair per port), `core/blong-gogo/src/codec/adapter/openapi/ready.ts`
(`requestSend` + `responseReceive` for a whole group),
`core/blong-gogo/src/codec/adapter/mle/ready.ts` (per-method conversions that call `super`),
`test/blong-sim-tcp/payshield/adapter/tcp/echoRequestSend.ts` (one file per conversion), and
`core/blong-realm/adapter/semlog/` (a realm that is nothing but conversions).

## Handler Types

### 1. Internal Handlers

Conversions and lifecycle hooks — `send`, `receive`, `encode`, `decode`, `exec`, `ready`,
`idleSend`, `idleReceive`, `drainSend`. What each one is for, how it is found and how it is named is
under _Conversions_ above: read that before writing an adapter, or any call to an external system.

### 2. API Handlers

Business functionality using semantic triple naming

### 3. Library Functions

Reusable functions shared between handlers

## Naming Convention: Semantic Triples

API handlers use `subjectObjectPredicate` format:

- **subject** - namespace/realm name
- **object** - entity within realm
- **predicate** - action on entity

### Examples

| Handler Name             | Subject | Object   | Predicate | Purpose          |
| ------------------------ | ------- | -------- | --------- | ---------------- |
| `userUserAdd`            | user    | user     | add       | Create a user    |
| `userRoleEdit`           | user    | role     | edit      | Edit a role      |
| `paymentTransferPrepare` | payment | transfer | prepare   | Prepare transfer |
| `mathNumberSum`          | math    | number   | sum       | Sum numbers      |

### Realm Structure Example

Realm: `user` with namespaces `identity`, `permission`, `user`

```
user/
├── orchestrator/
│   ├── identityDispatch.ts
│   ├── permissionDispatch.ts
│   ├── userDispatch.ts
│   ├── identity/
│   │   ├── identityTokenCreate.ts
│   │   └── identityTokenValidate.ts
│   ├── permission/
│   │   ├── permissionUserCheck.ts
│   │   └── permissionRoleGrant.ts
│   └── user/
│       ├── userUserAdd.ts
│       ├── userUserEdit.ts
│       ├── userUserFind.ts
│       └── userRoleEdit.ts
```

## Handler Pattern

### Basic Handler

Canonical skeleton: `.github/skills/_shared/conventions.md` → `[ARCHETYPE: HANDLER]`. Minimal form:

**Do not type this out from memory — generate it, then edit.** The API emits the correct idiom for
the current framework, stamps the `import unchanged` marker, embeds any instructions, and lints the
result ([KUKUM_API] in `_shared/conventions.md`):

```bash
kukum handler add --subject=shop --object=order --predicate=add --kind=api   # scaffold
kukum handler get --kind=api                                                # current template
kukum handler add --subject=shop --object=order --predicate=add --kind=library
kukum handler add --subject=shop --object=order --predicate=add --kind=db
kukum handler edit --path=orchestrator/shop/shopOrderAdd.ts --instructions="handle idempotency"
```

The result, for reference, is exactly the shape below.

```typescript
import {IMeta, handler} from '@feasibleone/blong';

// Type = API definition (validation + docs auto-derived)
type Handler = ({param1: string; param2: number}) => Promise<{result: string}>;

export default handler(
    ({lib: {helperFunction}, errors: {errorInvalidInput}, config, handler: {adapterHandler}}) =>
        async function realmEntityAction(
            params: Parameters<Handler>[0],
            $meta: IMeta,
        ): ReturnType<Handler> {
            const processed = helperFunction(params.param1);                            // lib
            const result = await adapterHandler({data: processed, count: params.param2}, $meta); // IoC + $meta
            return {result: result.value};
        },
);
```

Runtime destructure keys: `lib` (same-group fns), `errors` (realm error layer, simplified
`{errorEntityNotFound}` → `entity.notFound`), `config` (component config slice), `log`, `handler`
(IoC proxy to imported handlers).

### Library Function

```typescript
// realmname/orchestrator/entity/helperFunction.ts
import {library} from '@feasibleone/blong';

export default library(
    ({errors: {errorInvalidInput}}) =>
        function helperFunction(input: string): string {
            if (!input) {
                throw errorInvalidInput();
            }
            return input.toUpperCase();
        },
);
```

> **Library return types are `unknown`** (`LibFn` = `<T>(...params: unknown[]) => T`) — annotate at
> the call site:
>
> - Destructure the result via a call-site generic:
>   `const {hash, params} = hashPassword<{hash: string; params: P}>(...)`.
> - `return libFn(...)` works only when the enclosing fn has a declared return type.
> - Type-only imports (`import {type P} from './password.ts'`) are erased at runtime — safe, keep
>   DRY.

### Library as a configurable-bindings bundle (soft dependencies)

When a group's handlers share the same configurable dependencies — e.g. which access/external method
to call — resolve them **once in a `library()` factory** and return the object directly. Handlers
destructure the members straight from `lib` instead of each handler re-resolving the same bindings.

```typescript
// realmname/orchestrator/entity/entityLib.ts
import {library} from '@feasibleone/blong';

export default library(({config, handler}) => {
    // Runs ONCE at layer assembly:
    const methods = {
        externalCheck: resolveBinding(config, handler), // soft dependency (handler proxy)
        audit: resolveBinding(config, handler),
    };
    return {
        /**
         * Conventional `methods` map — typed via `ILib.methods` in
         * `core/blong/types.ts`: each value is a bound handler or
         * `undefined` when disabled.
         */
        methods,
        sha256, // pure helper (no config)
    };
});
```

Handlers read config **directly** — the library never re-exports config values — and call the
resolved handlers through the conventional `methods` map (destructure with a default, since it is
optional):

```typescript
export default handler(
    ({errors, config, lib: {methods = {}, sha256}}) => {
        const timeout = config.timeout ?? 5000; // read straight from config
        return async function realmEntityAction(params, $meta) {
            await methods.externalCheck?.(params, $meta);
            const hash = sha256<string>(...);
            // ...
        };
    },
);
```

**Why this pattern:** it is the idiomatic way to create **soft dependencies / configurable
bindings** between a realm and another component (e.g. blong-login → blong-access) without hard
imports. One factory resolves every binding from config and from the `handler` proxy into the
`methods` map; suites override or disable each binding via config, and the whole group picks up the
change. Plain constants live in config — handlers read their own `config` — so only the handler
bindings (which need the `handler` proxy) and pure helpers belong in the library.

Real-world example: `realm/blong-login/orchestrator/login/sessionLib.ts` — resolves the 11
configurable `login.methods.*` access methods into the conventional `methods` map and exposes pure
helpers (`sha256Hex`, `newCookieHandle`, `sessionCookieOptions(config)`, `readSessionCookie`);
`login.token.create` / `refresh` / `restore` / `revoke` / `exchange` consume `lib.methods` and read
cookie/expiry values straight from `config`.

## API Parameter: Destructuring

The `api` parameter provides access to framework and realm functionality:

### Available Properties

```typescript
handler(
    ({
        // Framework libraries
        lib: {
            error, // Error factory
            type, // TypeBox (for manual validation)
            bitsyntax, // Binary protocol parser
            sum, // User-defined library function
            rename, // Rename test arrays
        },

        // Domain errors (defined in error layer)
        // Simplified syntax (recommended):
        errors: {
            errorEntityNotFound, // Maps to 'entity.notFound'
            errorInvalidInput, // Maps to 'invalidInput'
            errorPermissionDenied, // Maps to 'permission.denied',
        },

        // Legacy syntax (backwards compatible):
        // errors: {
        //     'entity.notFound': errorEntityNotFound,
        //     'invalidInput': errorInvalidInput,
        //     'permission.denied': errorPermissionDenied
        // },

        // Configuration for this component
        config: {timeout, maxRetries, apiKey},

        // Logger instance
        log,

        // Other handlers (from imports)
        handler: {sqlUserFind, httpNotificationSend, otherRealmHandler},
    }) => {
        // Return handler function
    },
);
```

## File Organization

### One Handler Per File

**Benefits:**

1. Fast discovery: `ctrl+p uua` finds `userUserAdd.ts`
2. Easier code review
3. Clear boundaries
4. Git-friendly diffs

**Convention:**

- File name = handler name
- `userUserAdd.ts` exports `userUserAdd` handler
- `validateEmail.ts` exports `validateEmail` library function

### Folder Structure

```
orchestrator/
├── dispatch.ts
└── entity/
    ├── ~.schema.ts              # Auto-validation
    ├── helperLib.ts             # Library function
    ├── realmEntityAction1.ts    # Handler
    ├── realmEntityAction2.ts    # Handler
    └── realmEntityAction3.ts    # Handler
```

Group name: `realmname.entity` (referenced in `imports`)

### DB Persistence Handlers (`adapter/db/`)

DB persistence handlers live in `adapter/db/` and reach the shared knex pool via
`this.config?.context?.queryBuilder`:

```typescript
// adapter/db/subjectObjectAdd.ts
import {handler, type IMeta, type Knex} from '@feasibleone/blong';

export default handler(
    ({errors: {errorSubjectInvalidStatus}}) =>
        async function subjectObjectAdd(params: unknown, $meta: IMeta) {
            const qb = this.config?.context?.queryBuilder as Knex | undefined;
            if (!qb) throw new Error('Database not available');
            // persistence logic
        },
);
```

Do NOT put DB persistence handlers in `orchestrator/`. See **blong-layer** `[REUSE_SERVER]` and
`_shared/conventions.md` `[DB_ACCESS]`.

### Plain helper files in a handler group

A helper used by handlers in the SAME group may live beside them (e.g. `adapter/db/account.ts`
exporting `splitNames`). The loader reports it at **error** level —
`probably a generic source code was put in a handler group folder` — and imports still work, but the
line is real output: it reaches whatever reads the log, and `core/blong-realm`'s observed-flows page
listed it as a template row until the helper became a `library()`. Prefer the framework's own answer
for anything with logic in it: a helper is a library function (same folder, `library()` default
export reached through the `lib` proxy _without_ an import — see _Library Function_). For helpers
shared across groups, prefer a `lib/` group exported through the framework (`library()` factory), or
a clearly `_`/`.`-prefixed plain file; do not scatter shared helpers across handler folders.

## Calling Other Handlers

### From Orchestrator

```typescript
export default handler(
    ({
        handler: {
            sqlUserFind, // Database adapter
            paymentTransferCreate, // Other orchestrator
            httpNotificationSend, // HTTP adapter
        },
    }) =>
        async function userUserNotify(params, $meta) {
            const user = await sqlUserFind({userId: params.userId}, $meta);

            const payment = await paymentTransferCreate(
                {
                    userId: params.userId,
                    amount: 100,
                },
                $meta,
            );

            await httpNotificationSend(
                {
                    email: user.email,
                    subject: 'Payment Created',
                    body: `Payment ${payment.id} created`,
                },
                $meta,
            );

            return {success: true};
        },
);
```

### Using $meta

The `$meta` parameter carries context:

```typescript
async function handlerName(params, $meta) {
    // Call with original context
    await otherHandler(params, $meta);

    // Override method
    await adapterHandler(params, {
        ...$meta,
        method: 'specificOperationId',
    });

    // Expect specific error
    await riskyHandler(params, {
        ...$meta,
        expect: 'expectedErrorType',
    });
}
```

## Overriding / Customizing Default Handling

A handler file can override a method the framework (or another group) already provides and delegate
back to the default via `super`. This covers adapter lifecycle methods, the automatic CRUD `exec`,
and the `send`/`receive` conversion handlers.

### The `super` object

`super` is **native JS prototype-chain delegation**. The runtime chains handler groups with
`Object.setPrototypeOf` (see the `wiring-pipeline.md` rationale → "Prototype Chain Wiring"), so
`super.<method>` resolves the parent implementation — an earlier-attached handler group, a synthetic
handler bound to the port, or the adapter base.

To use `super`, the handler must return an **object literal with method shorthand** (a plain
function expression cannot reference `super`):

```typescript
export default handler(({lib: {helper}}) => ({
    async realmEntityEdit(params, $meta) {
        const result = await super.exec(params, $meta); // default handling
        await helper(params, $meta); // custom logic
        return result;
    },
}));
```

### `super.exec` — reuse automatic CRUD

For a persistence handler that must run custom logic around the automatic CRUD, name the handler
after the method (e.g. `accessUserEdit` → `access.user.edit`) and delegate the standard part with
`super.exec(params, $meta)`. The generic knex `exec` then performs `find`/`get`/`add`/`edit`/
`remove` against the table.

```typescript
// adapter/db/accessUserEdit.ts
export default handler(({handler: {'db/coreTripleMerge': coreTripleMerge}}) => ({
    async accessUserEdit(params, $meta) {
        const result = await super.exec(params, $meta); // generic edit
        // ... custom graph-edge persistence ...
        return result;
    },
}));
```

### `send` / `receive` conversions

Covered in full under _Conversions_ above — they are the port's seam for the outgoing request and
the incoming answer, they stack through `super`, and they are where a protocol belongs rather than
in each handler. The rest of this section is about the other overrides (`super.exec`, the lifecycle
hooks).

### Adapter lifecycle overrides

Stock adapters override the lifecycle and delegate with `super`:

```typescript
async start() {
    // custom startup (e.g. open a TCP server)
    super.connect(); // bind handle() into the port loop
    return super.start(); // default start (attach handlers, register ports)
},
async stop(...params) {
    try {
        /* custom shutdown */
    } finally {
        return super.stop(...params);
    }
},
```

Real-world examples: `test/blong-int-adapter/http/sim/echo.ts` (lifecycle),
`realm/blong-gateway/adapter/meter.ts` (`super.exec` fall-through),
`core/blong-gogo/src/codec/adapter/mle/ready.ts` (`send`/`receive` stack), and `schema-sync.md`
(`super.sqlItem*` synthetic-handler delegation).

## Error Handling

### Throwing Domain Errors

```typescript
export default handler(
    ({errors}) =>
        async function userUserFind(params, $meta) {
            if (!params.userId) {
                throw errors.invalidInput({
                    field: 'userId',
                    reason: 'required',
                });
            }

            const user = await sqlUserFind({id: params.userId}, $meta);

            if (!user) {
                throw errors.userNotFound({userId: params.userId});
            }

            return user;
        },
);
```

### Wrapping External Errors

```typescript
export default handler(
    ({errors}) =>
        async function callExternalAPI(params, $meta) {
            try {
                return await externalApiCall(params, $meta);
            } catch (error) {
                if (error.code === 'TIMEOUT') {
                    throw errors.externalTimeout({cause: error});
                }
                throw errors.externalError({
                    message: error.message,
                    cause: error,
                });
            }
        },
);
```

## Configuration Access

Handlers can access configuration provided either through the framework's merged config or from a
co-located `config.ts` file in the handler folder.

```typescript
export default handler(
    ({config}) =>
        async function processWithTimeout(params, $meta) {
            const timeout = config.timeout || 5000;

            return Promise.race([
                actualProcessing(params, $meta),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout)),
            ]);
        },
);
```

## Folder-Level Configuration (config.ts)

Canonical pattern: `.github/skills/_shared/conventions.md` → `[CONFIG_EXAMPLE]`. Place a `config.ts`
file in any handler folder to define configuration for all handlers in that folder. The file
supports activation-based config (`default`, `dev`, `prod`, etc.) using the same pattern as
`server.ts`, keeping environment-specific values co-located with the handlers that use them.

```
realmname/
└── orchestrator/
    └── payment/
        ├── config.ts            ← default config for payment handlers
        ├── paymentTransferSend.ts
        └── paymentTransferReceive.ts
```

```typescript
// realmname/orchestrator/payment/config.ts
export default {
    default: {
        timeout: 30000,
        retryCount: 3,
        endpoint: 'https://api.payment.example.com',
    },
    dev: {
        endpoint: 'https://api.dev.payment.example.com',
    },
};
```

Handlers in the same folder receive this config automatically:

```typescript
// realmname/orchestrator/payment/paymentTransferSend.ts
export default handler(
    ({config}: {config: {timeout: number; retryCount: number; endpoint: string}}) =>
        async function paymentTransferSend(params, $meta) {
            // config.timeout, config.retryCount, config.endpoint are available
        },
);
```

### Overriding Folder Config via Realm

The realm's `server.ts` can override folder config values using the `namespace` config property. Use
this for values that cannot live in source code (e.g. production secrets, deployment-specific URLs):

```typescript
// realmname/server.ts
import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    config: {
        prod: {
            namespace: {
                payment: {
                    // Override with production-specific values not stored in source
                    endpoint: 'https://api.prod.payment.example.com',
                },
            },
        },
    },
}));
```

**Priority order:** Realm `namespace` override > `config.ts` active environment activation >
`config.ts` `default`

## Automatic Validation

See **blong-validation** for the full pattern (Handler type → `~.schema.ts` → runtime validation +
OpenAPI docs).

### Define Handler Type

```typescript
/** @description "Description for API docs" */
type Handler = ({
    /** @description "Parameter description" */
    param1: string;
    param2?: number;  // Optional parameter
}) => Promise<{
    /** @description "Result description" */
    result: string;
}>;
```

### Create ~.schema.ts

Place `~.schema.ts` in handler folder:

- Auto-regenerates when handler types change
- Provides validation schemas
- Generates API documentation

### Use Types in Handler

```typescript
export default handler(
    () =>
        async function handlerName(
            params: Parameters<Handler>[0],
            $meta: IMeta,
        ): ReturnType<Handler> {
            // Type-safe implementation
            return {result: params.param1.toUpperCase()};
        },
);
```

## Best Practices

- **Types as API definition:** `type Handler` drives validation + OpenAPI docs (`~.schema.ts`
  auto-generated).
- **Conversions before code:** when a group's methods share a request shape, say it once in
  `send`/`receive` (or `encode`/`decode`) instead of in every handler — see _Conversions_.
- **Errors:** throw domain errors (`errors.xxx`), never generic `Error`.
- **$meta:** always forward; `{...$meta, expect}` for expected errors.
- **Co-locate config:** `config.ts` in the handler folder over `server.ts`.
- **JSDoc descriptions** in `Handler` types feed the generated API docs.
- **Coverage:** write test handlers for every business handler.

## Examples from Codebase

- **API handler:** `test/framework/demo/orchestrator/subject/subjectNumberSum.ts`
- **Library function:** `test/framework/demo/orchestrator/subject/sum.ts`
- **Adapter handler:** `test/framework/demo/adapter/http.ts`
- **TCP codec:** `test/framework/payshield/adapter/tcp/encode.ts`
- **Multiple handlers:** `ml/payment/orchestrator/transfer/`
- **Folder config:** `test/framework/nscfg/orchestrator/cfg/config.ts`
