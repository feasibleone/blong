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

Canonical framework rules + `[ARCHETYPE: HANDLER]` type signature:
`.github/skills/_shared/conventions.md`.

## Handler Types

### 1. Internal Handlers

Predefined handlers for adapter/protocol operations:

- **`send`** - Prepare data for sending, adapt for protocol
- **`receive`** - Transform received data, remove protocol details
- **`encode`** - Convert JavaScript object to Buffer (TCP)
- **`decode`** - Convert Buffer to JavaScript object (TCP)
- **`exec`** - Default handler when no specific handler exists
- **`ready`** - Called when adapter is ready
- **`idleSend`** - Send keep-alive message
- **`idleReceive`** - Handle idle timeout
- **`drainSend`** - Called when send queue is empty

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

When a group's handlers share the same configurable dependencies — e.g. which access/external
method to call — resolve them **once in a `library()` factory** and return the object directly.
Handlers destructure the members straight from `lib` instead of each handler re-resolving the
same bindings.

```typescript
// realmname/orchestrator/entity/entityLib.ts
import {library} from '@feasibleone/blong';

export default library(
    ({config, handler}) => {
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
    },
);
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
`methods` map; suites override or disable each binding via config, and the whole group picks up
the change. Plain constants live in config — handlers read their own `config` — so only the
handler bindings (which need the `handler` proxy) and pure helpers belong in the library.

Real-world example: `core/blong-login/orchestrator/login/sessionLib.ts` — resolves the 11
configurable `login.methods.*` access methods into the conventional `methods` map and exposes
pure helpers (`sha256Hex`, `newCookieHandle`, `sessionCookieOptions(config)`, `readSessionCookie`);
`login.token.create` / `refresh` / `restore` / `revoke` / `exchange` consume `lib.methods` and
read cookie/expiry values straight from `config`.

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
exporting `splitNames`). It triggers a benign
`probably a generic source code was put in a handler group folder` warning — imports still work. For
helpers shared across groups, prefer a `lib/` group exported through the framework (`library()`
factory), or a clearly `_`/`.`-prefixed plain file; do not scatter shared helpers across handler
folders.

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

### `send` / `receive` — transform parameters and results

- `send` transforms the **outgoing parameters** before the method executes.
- `receive` transforms the **incoming result** after the method returns.

They are conversion handlers probed by the port loop (`getConversion`): a per-method conversion
(`<subject>.<object>.<predicate>.request.send`), an mtid level conversion (`request.send`), or the
generic `send`/`receive`. They stack on top of each other — e.g. the MLE codec overrides
`send`/`receive` and calls `super.send`/`super.receive` to reach the JSON-RPC codec beneath it.

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

Real-world examples: `core/blong-int-adapter/http/sim/echo.ts` (lifecycle),
`core/blong-gateway/adapter/meter.ts` (`super.exec` fall-through),
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
- **Errors:** throw domain errors (`errors.xxx`), never generic `Error`.
- **$meta:** always forward; `{...$meta, expect}` for expected errors.
- **Co-locate config:** `config.ts` in the handler folder over `server.ts`.
- **JSDoc descriptions** in `Handler` types feed the generated API docs.
- **Coverage:** write test handlers for every business handler.

## Examples from Codebase

- **API handler:** `core/test/demo/orchestrator/subject/subjectNumberSum.ts`
- **Library function:** `core/test/demo/orchestrator/subject/sum.ts`
- **Adapter handler:** `core/test/demo/adapter/http.ts`
- **TCP codec:** `core/test/payshield/adapter/tcp/encode.ts`
- **Multiple handlers:** `ml/payment/orchestrator/transfer/`
- **Folder config:** `core/test/nscfg/orchestrator/cfg/config.ts`
