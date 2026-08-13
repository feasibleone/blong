---
name: blong-realm
description: Create business domain boundaries in Blong framework. Realms separate business logic into independent, modular units that can be deployed as monolith or microservices. Use this skill whenever creating a new business domain or service in Blong — even if the user says 'add a new module', 'create a new service', or 'set up a new package'.
---

# Implementing a Realm

## [CRITICAL_GUARDRAILS]

- **Well-known layer folders auto-discover** (`error`, `adapter`, `orchestrator`, `gateway`,
  `sim`, `test`) — no `layer.*.ts` needed. Custom names need one.
- **Layer config is co-located** in the layer file (`adapter(blong => …)`) — `server.ts` only for
  realm-level validation/config shared across layers.
- **`adapter/dbTest/` handlers are `dev`-only** — never ship in production; `adapter/db/` loads in
  all intents.
- **Browser namespace file REQUIRED** for portal pages: `browser/orchestrator/subject/init.ts`
  exporting `namespace: '<realmname>'` — without it browse fails "Method binding failed".
- **Omit `server.ts`** for standard realms.
- **Name consistency:** realm folder = package name = namespace prefix.

Canonical framework rules + layer table:
`.github/skills/_shared/conventions.md` → `[CRITICAL_GUARDRAILS]`, `[LAYER_DEFAULTS_TABLE]`,
`[CONFIG_EXAMPLE]`. Siblings: **blong-layer**, **blong-suite**.

## File Structure

```
realmname/
├── server.ts           # Optional — only for realm-level config/validation
├── package.json        # Package definition (if separate package)
├── adapter/            # Auto-discovered (well-known name)
│   └── db.ts           # Self-contained adapter
├── orchestrator/       # Auto-discovered (well-known name)
│   └── dispatch.ts     # Self-contained orchestrator
├── gateway/            # Auto-discovered (well-known name)
├── error/              # Auto-discovered (well-known name)
└── test/               # Auto-discovered (well-known name)
```

Custom layer folders need a `layer.server.ts`:

```
realmname/
└── myCustomLayer/
    └── layer.server.ts  # Required: declares activation for non-well-known folder
```

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

Adapter handler groups follow the `db` adapter's `imports` patterns. The shared `db` adapter
(`blong-server/adapter/db.ts`) imports handler groups matching `/\.db$/` in **all** intents, and
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

## Minimal server.ts (Only When Needed)

`server.ts` is **only needed** when the realm has:

- Realm-level validation schema
- Realm-level default config (e.g. keys, URLs shared across layers)

```typescript
// realmname/server.ts — only when realm-level config is needed
import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,

    // Realm-level validation (for config like JWT keys, URLs)
    validation: blong.type.Object({
        myService: blong.type.Object({
            url: blong.type.String(),
        }),
    }),

    // Realm-level defaults shared across layers
    config: {
        default: {
            myService: {
                url: 'http://localhost:8080',
            },
        },
    },
}));
```

### Layer Files Define Their Own Config

Each adapter/orchestrator defines its own configuration:

```typescript
// adapter/db.ts - configuration lives here, not in server.ts
import {adapter} from '@feasibleone/blong';

export default adapter(blong => ({
    extends: 'adapter.knex',
    validation: blong.type.Object({
        namespace: blong.type.Union([blong.type.String(), blong.type.Array(blong.type.String())]),
        imports: blong.type.Union([blong.type.String(), blong.type.Array(blong.type.String())]),
    }),
    activation: {
        default: {
            namespace: 'db/$subject',
            imports: '$subject.db',
        },
    },
}));
```

```typescript
// orchestrator/dispatch.ts - configuration lives here, not in server.ts
import {orchestrator} from '@feasibleone/blong';

export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            destination: 'db',
            namespace: ['$subject'],
            imports: [/^$subject\./],
            validations: [/^$subject\.\w+\.validation$/],
        },
    },
}));
```

## Configuration Concepts

### Environment Activations

Intent keys merged into active config — `default` (always), `dev`, `prod`, `test`, `db`, `realm`,
`microservice`, `integration`. See **blong-intent** for the full reference.

### Layer Activation

Set layer names to `true` to activate them in server.ts:

```typescript
config: {
    test: {
        error: true,
        adapter: true,
        orchestrator: true,
        gateway: true,
        test: true
    }
}
```

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
    async () => import('@feasibleone/blong-login/server.js'),
    async () => import('@feasibleone/blong-openapi/server.js'),
];
```

## Best Practices

- **Zero-config well-known folders**; `layer.*.ts` only for custom names.
- **Omit `server.ts`** for standard realms; keep it only for realm-level validation/shared config.
- **Co-locate config** in the layer file; **consistent names** (folder = package = namespace).

## Examples from Codebase

See `core/test/demo/` for a complete example without server.ts:

- No `layer.server.ts` files — auto-discovered via well-known folder names
- Each adapter/orchestrator file is self-contained with its own config

See `core/blong-marine/` for an example of a realm that can run both **standalone** (own Vite /
Storybook / Playwright) **and** as a child of a larger suite:

- `browser.ts` and `server.ts` are `browser()` / `server()` suite entries (not `realm()`)
- They include all their own infrastructure (blong-browser, blong-server, blong-login) as children
- A parent suite (e.g. `core/blong-suite/`) simply imports `@feasibleone/blong-marine/browser.ts` as
  a child;
- Adding a second realm to the suite: append one line to the parent `browser.ts` children array and
  add the package to `realmPackages` in `playwright.config.ts` and `.storybook/main.ts`

## Standalone Realm Entry Points

When a realm is developed and tested as a standalone package (with its own Vite, Storybook, and
Playwright setup), it needs additional entry point files that wire its infrastructure dependencies.

### index.ts — server bootstrap for testing

`index.ts` exports a `server()` definition that wraps the realm with the dependencies it needs
(typically `blong-server`, `blong-login`, and the realm itself). The framework auto-detects the
`server()` kind and runs it via `runPlatform()` — no import from `blong-gogo` needed:

```typescript
// realmname/index.ts
import {server} from '@feasibleone/blong';
import pkg from './package.json' with {type: 'json'};

export default server(() => ({
    url: import.meta.url,
    pkg: {name: pkg.name, version: pkg.version},
    children: [
        async function srv() {
            return import('@feasibleone/blong-server/server.ts');
        },
        async function login() {
            return import('@feasibleone/blong-login/server.ts');
        },
        async function realm() {
            return import('./server.ts');
        },
    ],
    config: {
        default: {},
        dev: {srv: {}, realm: {}, login: {}},
    },
}));
```

This is a dev dependency pattern — `index.ts` wires the realm's runtime infrastructure for local
development and integration tests. It is not imported by a parent suite; the parent suite imports
`./server.ts` instead.

### index.html.ts — browser entry point (Vite)

`index.html.ts` is the TypeScript Vite entry point (loaded by `index.html`). It loads the browser
platform using `blong-gogo`:

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

`index.browser.ts` is the browser-platform equivalent of `index.ts`. It exports a `browser()`
definition that wires the realm's browser infrastructure (blong-browser, login, and the realm):

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

`index.html` references `./index.html.ts` as its module entry:

```html
<script
    type="module"
    src="./index.html.ts"
></script>
```

### Browser namespace file — REQUIRED for portal pages

A realm that contributes portal/browse pages MUST also create `browser/orchestrator/subject/init.ts`
exporting the realm's subject namespace:

```typescript
// realmname/browser/orchestrator/subject/init.ts
import {handler} from '@feasibleone/blong';

export default handler(() => ({
    namespace: 'realmname', // <-- the realm's subject
}));
```

Without it the browser cannot bind `realmname.*` calls and browse fails with "Method binding
failed". The `blong-kopi` realm template scaffolds this file automatically (and the realm skill
should always generate it).
