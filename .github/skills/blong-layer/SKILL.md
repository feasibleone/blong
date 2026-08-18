---
name: blong-layer
description:
    Organize handlers into named functional groups within a Blong realm. Layers include gateway
    (API), adapter (external systems), orchestrator (business logic), error (domain errors), and
    test (automation). Use this skill whenever creating a new layer in a realm, setting up the
    folder structure for handlers, or configuring which layers activate in which environment — even
    if the user just says 'organize this' or 'add a new layer'.
---

# Implementing a Layer

## [CRITICAL_GUARDRAILS]

- **Layers are self-contained.** Config + validation + `activation` live in the layer file — NOT the
  realm `server.ts`. `server.ts` only for realm-level shared config.
- **Well-known folders auto-discover** — server: `error`, `sim`, `adapter`, `orchestrator`,
  `gateway`, `meta`, `server/api`, `server/init`, `server/test`; browser: `backend`, `component`,
  `action(s)`, `test`, `browser/api`, `browser/init`, `browser/test`, `browser/orchestrator` — no
  `layer.*.ts` needed. Custom names need one.
- **[REUSE_SERVER]** Realms reuse blong-server's subject orchestrator + db adapter. Do NOT create a
  realm-local `adapter/db.ts` or a dispatch orchestrator unless a genuinely different
  routing/adapter is needed (e.g. a realm-local Redis adapter like
  `core/blong-gateway/adapter/meter.ts`).
- **One handler per file** — file = exported fn = semantic triple.
- **Import order:** error → adapter → orchestrator → gateway → test.
- **No direct cross-handler imports.** Load groups via `imports` in the adapter/orchestrator.

Canonical layer-defaults intents + config pattern: `.github/skills/_shared/conventions.md` →
`[LAYER_DEFAULTS_TABLE]`, `[CONFIG_EXAMPLE]`.

## Layer Names (auto-detected)

### Server-Side

- **`gateway`** - API gateway: routes, validation, documentation (minimal business logic)
- **`adapter`** - External system communication: SQL, HTTP, FTP, mail protocols
- **`orchestrator`** - Business process coordination between adapters
- **`error`** - Domain-specific error definitions
- **`meta`** - Schema (`type/schema.ts`), DB registration (`db/db.ts`), seeds (`db/*.yaml`,
  `dbTest/*.yaml`), models (`model/*Model.ts`)
- **`server/test`** - Server-side tap tests (handler group `realmname.test`)

### Browser-Side

- **`backend`** - Browser adapter talking to server
- **`component`** - React UI components
- **`test`** - Playwright `*.play.ts` (browser layer)
- **`browser/test`** - Browser-side tap tests
- **`browser/orchestrator`** - Browser namespace bindings + React orchestrator components

> Top-level `test/` is a BROWSER layer holding Playwright `*.play.ts` — do NOT put server tap tests
> there; use `server/test/`.

## Folder Structure

### Typical Realm with Layers

Well-known layer folders are auto-discovered — no `layer.server.ts` needed:

```
realmname/
├── server.ts            # Minimal realm entry: realm(() => ({url: import.meta.url}))
├── error/               # Auto-activated (well-known name)
│   └── error.ts
├── adapter/             # Auto-activated (well-known name)
│   └── db/              # Handler group: realmname.db (attached to blong-server's srv.db)
│       ├── userUserAdd.ts
│       └── userUserFind.ts
├── orchestrator/        # Auto-activated (well-known name)
│   └── subject/         # Handler group: realmname.subject
│       └── init.ts      # namespace only — REUSE blong-server's subject orchestrator
├── meta/                # Auto-activated (well-known name)
│   ├── type/schema.ts
│   ├── db/db.ts
│   ├── db/*.yaml
│   ├── dbTest/*.yaml
│   └── model/*Model.ts
├── gateway/             # Auto-activated (well-known name)
│   └── <subject>/       # explicit validation files (public-model overrides)
├── server/test/         # Server tap tests (server/test/ layer)
└── test/                # Playwright *.play.ts (browser layer)
```

Custom (non-well-known) layer folders need a `layer.server.ts` or `layer.browser.ts`:

```
realmname/
└── myCustomLayer/
    └── layer.server.ts  # Required: declares activation for non-well-known folder
```

## layer.server.ts / layer.browser.ts

For folders with non-standard names, add a `layer.server.ts` or `layer.browser.ts` to declare which
CLI **intents** activate the layer. This eliminates the need for an explicit `children` array or
activation config in the parent `server.ts`.

```typescript
// myCustomLayer/layer.server.ts
import {layer} from '@feasibleone/blong';

export default layer({
    default: true, // active regardless of which intents are present
    microservice: true, // additionally active when the microservice intent is present
});
```

```typescript
// myBrowserLayer/layer.browser.ts
import {layer} from '@feasibleone/blong';

export default layer({
    integration: true, // only active when the integration intent is present
});
```

### Well-Known Layer Default Intents

The intent that activates the layer (`{default: true}` = always active). Canonical table:
`.github/skills/_shared/conventions.md` → `[LAYER_DEFAULTS_TABLE]`. Provide a `layer.server.ts` to
override any entry. See **blong-intent** for the full intents reference and custom intents.

### Dev-Only Handler Groups (`.dev` suffix)

A handler-group folder whose name ends in `.dev` (e.g. `gateway/vision.dev/`) loads **only under the
`dev` intent** — under any other intent the whole folder is skipped. This is the general mechanism
for making a specific handler group (gateway validations, orchestrator namespaces, handlers)
dev-only without touching config. It complements the `adapter/dbTest` pattern (which is scoped to
the db adapter's import regex).

```text
gateway/
├── subject/            # loaded in every environment
└── vision.dev/         # loaded only under `dev` (e.g. demo metered API)
```

The `.dev` suffix is a **loading gate only** — it does not change names. Gateway validations are
keyed by function name (`visionCompute` → `vision.compute`) and orchestrator namespaces are declared
explicitly in `init.ts` (`{namespace: 'vision'}`), so a `.dev` folder keeps the same
routes/namespaces as its non-`.dev` equivalent.

## Self-Contained Layer Pattern

> The examples below are for **additional realm-local adapters/orchestrators** (e.g. a realm-local
> Redis adapter like `core/blong-gateway/adapter/meter.ts`). For standard DB access do NOT create
> `adapter/db.ts` — reuse blong-server's shared `srv.db` and contribute `adapter/db/*.ts` handlers
> that read `this.config?.context?.queryBuilder`.

### Adapter Layer Definition

A realm adds a realm-local adapter only when it integrates an additional external system on top of
the shared `srv.db` — e.g. a Redis meter adapter (see `core/blong-gateway/adapter/meter.ts`):

```typescript
// adapter/meter.ts - self-contained realm-local adapter (config + validation co-located)
import {adapter} from '@feasibleone/blong';

export default adapter(blong => ({
    extends: 'adapter.redis',

    // Layer's own configuration per environment
    activation: {
        default: {namespace: 'meter', imports: []},
        dev: {redis: {host: '127.0.0.1', port: 6379}},
    },
}));
```

### Orchestrator Layer Definition

Realms normally REUSE blong-server's `subject` orchestrator (namespace `subject`, destination `db`)
via `orchestrator/subject/init.ts`. A realm-local dispatch orchestrator is only needed for a
genuinely different routing shape (e.g. `blong-login/orchestrator/loginDispatch.ts`):

```typescript
// orchestrator/loginDispatch.ts - self-contained dispatch orchestrator (rarely needed)
import {orchestrator} from '@feasibleone/blong';

export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',

    activation: {
        default: {
            destination: 'db',
            namespace: ['login'],
            imports: [/^login\./],
        },
    },
}));
```

### Realm Entry Point (Only When Needed)

`server.ts` is optional. It is only needed when there is realm-level config or validation shared
across layers.

```typescript
// server.ts — only when realm-level config is needed
import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        myService: blong.type.Object({url: blong.type.String()}),
    }),
    activation: {
        default: {
            myService: {url: 'http://localhost:8080'},
        },
    },
}));
```

## Handler Group Pattern

### Group Naming Convention

Groups are named in format: `realmname.foldername`

Example:

- Realm: `user`
- Folder: `orchestrator/user/`
- Group name: `user.user`

### Referencing Groups

Groups are referenced in the `imports` property of the adapter/orchestrator:

```typescript
// adapter/db.ts - imports declared inline
export default adapter(blong => ({
    extends: 'adapter.knex',
    activation: {
        default: {
            namespace: ['user', 'role'],
            imports: ['user.user', 'user.role'], // handler groups loaded
        },
    },
}));
```

### Folder-Level Default Configuration (config.ts)

Canonical pattern: `.github/skills/_shared/conventions.md` → `[CONFIG_EXAMPLE]`. Each handler group
folder can contain a `config.ts` file that defines configuration for all handlers in that folder.
The file supports activation-based config (`default`, `dev`, `prod`, etc.) using the same pattern as
`server.ts`, making the group self-contained with environment-specific values co-located with the
handlers that use them:

```
orchestrator/
├── dispatch.ts
└── payment/           # Handler group
    ├── config.ts      ← default config for this group
    ├── ~.schema.ts
    └── paymentTransferSend.ts
```

```typescript
// orchestrator/payment/config.ts
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

The realm's `server.ts` can override specific values using the `namespace` property nested in the
realm config. Use this for deployment-specific values (e.g. secrets or production URLs) that cannot
live in source code:

```typescript
// server.ts — override specific values from orchestrator/payment/config.ts
import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    config: {
        prod: {
            namespace: {
                payment: {endpoint: 'https://api.prod.payment.example.com'},
            },
        },
    },
}));
```

**Priority:** Realm `namespace` override > `config.ts` active environment activation > `config.ts`
`default`

## Implementation Patterns

### Error Layer

```typescript
// realmname/error/error.ts
export default {
    userNotFound: 'User not found',
    userExists: 'User already exists',
    invalidEmail: 'Invalid email format',
    permissionDenied: 'Permission denied',
};
```

### Adapter Layer Structure

```
adapter/
├── db.ts              # Self-contained database adapter
├── http.ts            # Self-contained HTTP adapter
├── db/                # Handler group for db operations
│   ├── userAdd.ts
│   └── userFind.ts
└── http/              # Handler group for HTTP operations
    ├── send.ts
    └── receive.ts
```

### Orchestrator Layer Structure

```
orchestrator/
├── dispatch.ts        # Self-contained orchestrator definition
├── entity1/           # Handler group: realmname.entity1
│   ├── ~.schema.ts   # Auto-generated validation
│   ├── helper.ts     # Library function
│   └── realmEntity1Action.ts
└── entity2/           # Handler group: realmname.entity2
    ├── ~.schema.ts
    └── realmEntity2Action.ts
```

### Gateway Layer Structure

```
gateway/
└── api/
    ├── entity1.yaml   # OpenAPI spec for entity1
    └── entity2.yaml   # OpenAPI spec for entity2
```

Or with custom validation:

```
gateway/
└── entity/
    ├── entityAction1.ts  # Manual validation
    └── entityAction2.ts
```

### Test Layer Structure

```
test/
└── test/              # Handler group: test.test
    ├── testEntity1.ts
    ├── testEntity2.ts
    └── testWorkflow.ts
```

## Layer Activation

### In Realm Configuration (server.ts)

```typescript
export default realm(blong => ({
    config: {
        // Activate for automated testing
        test: {
            error: true,
            adapter: true,
            orchestrator: true,
            gateway: true,
            test: true,
        },

        // Activate for microservice deployment
        microservice: {
            error: true,
            adapter: true,
            orchestrator: true,
            gateway: true,
        },

        // Activate for single realm dev focus
        realm: {
            adapter: true,
            orchestrator: true,
        },

        // Development with full stack
        dev: {
            error: true,
            adapter: true,
            orchestrator: true,
            gateway: true,
        },
    },
}));
```

## One Handler Per File Pattern

### Benefits

1. **Fast Discovery:** Use `ctrl+p` in VS Code to find handlers quickly
    - Example: `ctrl+p uua` finds `userUserAdd.ts`
2. **Easier Code Review:** Smaller files, less nesting
3. **Better Isolation:** Clear boundaries between handlers
4. **Git-Friendly:** Smaller diffs, fewer conflicts

### Naming Convention

File name = handler name:

- Handler: `userUserAdd` → File: `userUserAdd.ts`
- Handler: `mathNumberSum` → File: `mathNumberSum.ts`
- Library: `validateEmail` → File: `validateEmail.ts`

## Adding a New Adapter

**Co-locate everything in the layer file** — `adapter/newadapter.ts` carries `extends` +
`validation` + `activation`; zero `server.ts` edits (touch 1 file, not 2). See
`[ARCHETYPE: ADAPTER_HTTP]` / `[CONFIG_EXAMPLE]` in `_shared/conventions.md`.

## Multi-Layer Example

### Complete Realm Structure

```
payment/
├── server.ts           # Minimal - activation only
├── error/
│   └── error.ts
├── adapter/
│   ├── db.ts           # Self-contained: config + validation inside
│   ├── fspiop.ts       # Self-contained: config + validation inside
│   └── db/
│       ├── paymentCreate.ts
│       └── paymentFind.ts
├── orchestrator/
│   ├── dispatch.ts     # Self-contained: config + validation inside
│   ├── transfer/
│   │   ├── ~.schema.ts
│   │   ├── calculateFees.ts
│   │   ├── paymentTransferPrepare.ts
│   │   └── paymentTransferCommit.ts
│   └── quote/
│       ├── ~.schema.ts
│       └── paymentQuoteCreate.ts
├── gateway/
│   └── api/
│       ├── transfer.yaml
│       └── quote.yaml
└── test/
    └── test/
        ├── testTransfer.ts
        └── testQuote.ts
```

## Best Practices

- **Co-locate config** in the layer file, not `server.ts`.
- **Keep business logic in orchestrators**, not the gateway.
- **Lowercase single-word layer names**; group handlers by entity.
- **Define errors in the error layer first**; extract reusable logic to library fns.
- **Validation:** `~.schema.ts` auto-generated from Handler types.
- **Test layer** covering all business handlers.

## Examples from Codebase

- **Complete realm:** `core/test/demo/`
- **Payment realm:** `ml/payment/`
- **Agreement realm:** `ml/agreement/`
