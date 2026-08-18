---
name: blong-realm
description:
    Create business domain boundaries in Blong framework. Realms separate business logic into
    independent, modular units that can be deployed as monolith or microservices. Use this skill
    whenever creating a new business domain or service in Blong — even if the user says 'add a new
    module', 'create a new service', or 'set up a new package'.
---

# Implementing a Realm

## Start with blong-kopi (scaffold, then adjust)

Create a realm by **scaffolding `@feasibleone/blong-kopi`** — do NOT hand-build the folder
structure. The scaffolded realm is complete and runnable, and it **reuses the shared
`@feasibleone/blong-server`** subject orchestrator + db adapter (the canonical pattern used by
`blong-access`, `blong-party`, `blong-gateway`).

### Create it

```bash
blong realm <name>                     # create is implied
blong create realm <name>              # explicit form
blong realm <name> --object <entity>   # entity ("object" of the triple); default `entry`
```

The framework also auto-scaffolds when a suite declares a realm child whose folder is missing and
`kopi.realm` is enabled in config — see `core/blong-kopi/README.md` for the exact trigger conditions
and the rename steps.

### Then adjust (what to change per context)

1. **Rename the entity** — the default is `entry` (plus a `line` detail table). Rename `entry` →
   your entity (e.g. `invoice`) and `line` → your detail entity across file names, table names and
   field prefixes. Use two-word property names everywhere (`invoiceNumber`, not `number`).
2. **Set the package name/version** in `package.json`, register the package in `rush.json`,
   `rush update`.
3. **Add tables** — edit `meta/type/schema.ts` + `meta/db/db.ts` (see **blong-schema**).
4. **Add models** — edit/extend `meta/model/*Model.ts` (see **blong-model**).
5. **Add custom DB handlers** — `adapter/db/<subject><Object><Predicate>.ts` using `queryBuilder`
   (see **blong-handler**); add gateway override files for non-standard operations (see
   **blong-model**).
6. **Add seeds** — `meta/db/*.yaml` (prod) + `meta/dbTest/*.yaml` (test), including the RBAC merge
   seed (see **blong-core**).
7. **Wire tests** — `server/test/` tap flow + `browser/test/` tap flow + `test/*.play.ts` Playwright
   (see **blong-test-api**, **blong-playwright**).
8. **Adjust ports** in `playwright.config.ts` if they clash with a locally-running realm.

## [CRITICAL_GUARDRAILS]

- **[REUSE_SERVER]** A realm REUSES blong-server's subject orchestrator + db adapter. Do NOT create
  a realm-local `adapter/db.ts` or a dispatch orchestrator. The realm contributes
  `orchestrator/subject/init.ts` (namespace) + `adapter/db/*.ts` handlers + `meta/`.
- **[DB_ACCESS]** DB persistence handlers live in `adapter/db/` and reach the shared knex pool via
  `this.config?.context?.queryBuilder` — do NOT put them in `orchestrator/`.
- **`subject` stays literal** in `orchestrator/subject/init.ts` and
  `browser/orchestrator/subject/init.ts` — only the `namespace` value is the realm name. Replacing
  the folder name breaks method binding.
- **Server test layer is `server/test/`** (tap), browser test layer is `browser/test/` (tap), and
  the top-level `test/` folder holds Playwright `*.play.ts` (a browser layer). Do not put server tap
  tests in top-level `test/`.
- **Well-known layer folders auto-discover** (`error`, `adapter`, `orchestrator`, `gateway`, `meta`,
  `sim`, `server/test`) — no `layer.*.ts` needed. Custom names need one.
- **Layer config is co-located** in the layer file — `server.ts` only for realm-level
  validation/config shared across layers.
- **`adapter/dbTest/` handlers are `dev`-only** — never ship in production; `adapter/db/` loads in
  all intents.
- **Browser namespace file REQUIRED** for portal pages: `browser/orchestrator/subject/init.ts`
  exporting `namespace: '<realmname>'` — without it browse fails "Method binding failed".
- **Name consistency:** realm folder = package name = namespace prefix.

Canonical framework rules + layer table: `.github/skills/_shared/conventions.md` →
`[CRITICAL_GUARDRAILS]`, `[LAYER_DEFAULTS_TABLE]`, `[CONFIG_EXAMPLE]`. Siblings: **blong-layer**,
**blong-suite**.

## File Structure (canonical — what blong-kopi scaffolds)

```text
realmname/
├── server.ts                # Minimal realm entry: realm(() => ({url: import.meta.url}))
├── browser.ts               # Realm browser entry (auto-discovers meta/ + browser/orchestrator)
├── package.json             # Name/version set by you; devDeps for the standalone test setup
├── index.ts                 # Standalone server bootstrap: srv + login + core + access + realm
├── index.browser.ts         # Standalone browser bootstrap: ui + realm
├── index.html.ts / index.test.ts / browser-test.ts
├── vite.config.ts / playwright.config.ts
├── orchestrator/
│   └── subject/
│       └── init.ts          # namespace only — REUSE blong-server (folder `subject` literal)
├── adapter/
│   └── db/                  # custom DB handlers (queryBuilder); auto-attached to srv.db
├── meta/                    # schema, db config, seeds, models
│   ├── type/schema.ts
│   ├── db/db.ts             # table registration + dbTest
│   ├── db/*.yaml            # prod seeds
│   ├── dbTest/*.yaml        # test seeds (including RBAC)
│   └── model/*Model.ts      # public model specs
├── gateway/
│   └── <subject>/           # explicit validation for non-standard ops (public-model override)
├── error/error.ts
├── server/test/test/        # server tap tests (test.<object> group)
├── browser/test/test/       # browser tap tests (HTTP-level access control)
└── test/                    # Playwright *.play.ts (browser layer)
```

Reference realms: `core/blong-access`, `core/blong-party`, `core/blong-gateway` (canonical
blong-server reuse); `core/blong-suite` shows wiring multiple realms into one suite.

## Recommended skill set for creating a realm

Load at least: **blong-realm**, **blong-schema**, **blong-handler**, **blong-error**,
**blong-model**, **blong-test-api**, and — when UI tests are in scope — **blong-playwright**. This
set produces architecturally correct realms; skipping skills causes re-discovery and iteration
loops.

## layer.server.ts / layer.browser.ts

Only needed for non-well-known folder names. Declares activation per environment.

```typescript
// myCustomLayer/layer.server.ts
import {layer} from '@feasibleone/blong';

export default layer({
    default: true, // active in all environments (regardless of intents)
    microservice: true, // additionally active when the microservice intent is present
});
```

```typescript
// myBrowserLayer/layer.browser.ts
import {layer} from '@feasibleone/blong';

export default layer({
    integration: true, // active only when the integration intent is present
});
```

### Well-known Folder Defaults

Canonical table: `.github/skills/_shared/conventions.md` → `[LAYER_DEFAULTS_TABLE]`. Override any
default by adding a `layer.server.ts` / `layer.browser.ts`. See **blong-intent** for custom intents.

### Test-Only Handler Groups (`dbTest`)

Adapter handler groups follow the shared `db` adapter's `imports` patterns
(`blong-server/adapter/db.ts`): it imports handler groups matching `/\.db$/` in **all** intents, and
only adds `/\.dbTest$/`, `/\.model$/`, `/\.fixture$/` under the **`dev`** intent. Consequence:

- Handlers in `adapter/db/` are loaded **always** (including production).
- Handlers in `adapter/dbTest/` are loaded **only in the `dev` intent** — never in production.

Put test-only/demo handlers (reference endpoints, demo metered APIs, fixtures) in `adapter/dbTest/`
so they never ship to production:

```text
realmname/
└── adapter/
    ├── db/          # Production handlers (loaded in all intents)
    └── dbTest/      # Test-only handlers (loaded only in the dev intent)
```

## Minimal server.ts

The canonical realm `server.ts` is minimal — layers are auto-discovered and blong-server is wired by
the standalone `index.ts` (or a suite):

```typescript
// realmname/server.ts
import {realm} from '@feasibleone/blong';

export default realm(() => ({url: import.meta.url}));
```

Add realm-level validation/config only when genuinely shared across layers:

```typescript
// realmname/server.ts — only when realm-level config is needed
import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        myService: blong.type.Object({url: blong.type.String()}),
    }),
    config: {
        default: {
            myService: {url: 'http://localhost:8080'},
        },
    },
}));
```

### Layer Files Define Their Own Config

Each adapter/orchestrator defines its own configuration in the layer file. A realm that needs an
ADDITIONAL adapter (on top of the shared `srv.db`) declares it co-located:

```typescript
// adapter/meter.ts — a realm-local adapter, co-located config
import {adapter} from '@feasibleone/blong';

export default adapter(blong => ({
    extends: 'adapter.redis',
    activation: {
        default: {namespace: 'meter', imports: []},
        dev: {redis: {host: '127.0.0.1', port: 6379}},
    },
}));
```

(Example: `core/blong-gateway/adapter/meter.ts`.)

## Configuration Concepts

### Environment Activations

Intent keys merged into active config — `default` (always), `dev`, `prod`, `test`, `db`,
`microservice`, `integration`, plus the realm-creation intents `realm` / `create` (CLI-only). See
**blong-intent** for the full reference.

### Config Priority (highest to lowest)

1. CLI parameters (`--config.db.host=localhost`)
2. Environment variables (`BLONG_DB_HOST`)
3. Environment-specific layer config (layer's `config.dev`)
4. Layer's default config (layer's `config.default`)
5. Framework defaults

## Loading Children

Children can be loaded as:

### Local Paths (with auto-discovery)

```typescript
children: [
    './adapter', // Scans adapter/ folder for self-contained layer files
    './orchestrator', // No server.ts needed in these folders
];
```

The framework auto-discovers `.ts` files in each child folder. If a `server.ts` exists in the child
folder, it is used as the realm entry point instead (for nested realms like sub-domains).

### Async Imports (for external packages)

When including external realm packages, use async imports in the APPLICATION-level `server.ts` /
`browser.ts`:

```typescript
children: [
    async () => import('@feasibleone/blong-login/server.ts'),
    async () => import('@feasibleone/blong-openapi/server.ts'),
];
```

## Best Practices

- **Scaffold from blong-kopi**, then adjust — do not hand-build the structure.
- **Reuse blong-server** (subject orchestrator + db adapter); only add realm-local adapters when a
  new external system is involved.
- **Zero-config well-known folders**; `layer.*.ts` only for custom names.
- **Co-locate config** in the layer file; **consistent names** (folder = package = namespace).

## Examples from Codebase

- `core/blong-party/` — the simplest canonical realm: pure auto-CRUD over `meta/` tables + models,
  no `adapter/db/*` handlers, standalone `index.ts` / `index.browser.ts` / Playwright
  `test/*.play.ts`.
- `core/blong-access/` — canonical realm with custom `adapter/db/*` handlers (queryBuilder), RBAC
  merge seeds, server + browser tap tests.
- `core/blong-gateway/` — canonical realm plus a realm-local Redis adapter (`adapter/meter.ts`).

## Standalone Realm Entry Points

A realm developed and tested standalone needs entry point files that wire its infrastructure
dependencies. `blong-kopi` scaffolds all of these.

### index.ts — server bootstrap for testing

`index.ts` exports a `server()` definition that wraps the realm with its dependencies
(`blong-server` as `srv`, `blong-login`, `blong-core`, `blong-access`, and the realm). The framework
auto-detects the `server()` kind and runs it via `runPlatform()`:

```typescript
// realmname/index.ts
import {server} from '@feasibleone/blong';

export default server(() => ({
    url: import.meta.url,
    children: [
        async function srv() {
            return import('@feasibleone/blong-server/server.ts');
        },
        async function login() {
            return import('@feasibleone/blong-login/server.ts');
        },
        async function core() {
            return import('@feasibleone/blong-core/server.ts');
        },
        async function access() {
            return import('@feasibleone/blong-access/server.ts');
        },
        async function realm() {
            return import('./server.ts');
        },
    ],
    config: {
        default: {
            gateway: {authorize: 'access.authorization.list'},
        },
        dev: {srv: {}, core: {}, access: {}, realm: {}, login: {}},
        integration: {
            watch: {test: ['test.<object>']},
        },
    },
}));
```

This is a dev-dependency pattern — `index.ts` wires the realm's runtime infrastructure for local
development and integration tests. It is not imported by a parent suite; the parent suite imports
`./server.ts` instead.

### index.html.ts — browser entry point (Vite)

`index.html.ts` loads the browser platform using `blong-gogo`:

```typescript
// realmname/index.html.ts
import load from '@feasibleone/blong-gogo';
import browser from './index.browser.ts';
import pkg from './package.json' with {type: 'json'};

load(browser, pkg.name, {apiSchema: false}, ['microservice', 'integration', 'dev'])
    .then(platform => platform.start({}))
    .catch(console.error);
```

### index.browser.ts — browser suite definition

`index.browser.ts` exports a `browser()` definition wiring the realm's browser infrastructure
(blong-browser + the realm):

```typescript
// realmname/index.browser.ts
import {browser} from '@feasibleone/blong';
import pkg from './package.json' with {type: 'json'};

export default browser(blong => ({
    url: import.meta.url,
    pkg: {name: pkg.name, version: pkg.version},
    validation: blong.type.Object({realm: blong.type.Object({})}),
    children: [
        async function ui() {
            return import('@feasibleone/blong-browser/browser.ts');
        },
        async function realm() {
            return import('./browser.ts');
        },
    ],
    config: {
        default: {
            ui: {portal: {portal: {title: 'My Realm'}}},
            realm: {},
        },
    },
}));
```

### Browser namespace file — REQUIRED for portal pages

A realm that contributes portal/browse pages MUST export the subject namespace in
`browser/orchestrator/subject/init.ts` (and the server-side `orchestrator/subject/init.ts`). Both
are scaffolded by blong-kopi:

```typescript
// realmname/browser/orchestrator/subject/init.ts
import {handler} from '@feasibleone/blong';

export default handler(() => ({
    namespace: 'realmname', // <-- the realm's subject
}));
```

Without it the browser cannot bind `realmname.*` calls and browse fails with "Method binding
failed". The folder name `subject` stays literal.
