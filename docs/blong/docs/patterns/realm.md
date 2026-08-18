# Realm

A [realm](../concepts/realm.md) is a business domain boundary. Realms are scaffolded with the
`blong realm <name>` CLI (from the `blong-kopi` template) — do not hand-build the folder structure.

## The modern minimal `server.ts`

Well-known layer folders (`error/`, `sim/`, `adapter/`, `orchestrator/`, `gateway/`, `meta/`,
`server/api`, `server/init`, `server/test`) are **auto-discovered** — a realm's `server.ts` does
**not** need a `children: [...]` list to activate them, and there is no per-layer activation
config in `server.ts` (layers co-locate their own `activation`).

`server.ts` is **optional** and is only included when realm-level shared config/validation is
needed:

```ts
// realmname/server.ts
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

Config activations (`default`, `dev`, `prod`, `microservice`, `integration`) merge into the active
config; they configure adapters/orchestrators, not which well-known layers load.

## Reusing blong-server (recommended)

A realm that does CRUD over a database REUSES `@feasibleone/blong-server`'s subject orchestrator
(namespace `subject`, destination `db`) and db adapter (namespace `db`) — it contributes handler
groups (`<realm>.subject`, `<realm>.db`, `<realm>.model`, `<realm>.test`) matched by the adapter's
import regexes, plus `orchestrator/subject/init.ts` and `meta/`. Do not create a realm-local
`adapter/db.ts` or a dispatch orchestrator.

## Folder layout (kopi-scaffolded realm)

```
realmname/
├── server.ts              # Optional — only for realm-level shared config
├── index.ts               # Suite entry point (server + browser platforms)
├── error/                 # Typed domain errors (server, integration)
├── adapter/db/            # <realm>.db handler group (server, integration)
├── orchestrator/subject/  # <realm>.subject handlers + init.ts namespace (server, integration)
├── gateway/               # Explicit per-operation validation overrides (server, integration)
├── meta/                  # Schema + seeds (db.ts, *.yaml, model specs) — default
├── server/test/           # Server tap tests (server, integration)
│   └── test/              #   e.g. testUserFlow.ts
├── browser/test/          # Browser tap tests (browser, integration)
└── test/                  # BROWSER layer — Playwright *.play.ts (browser, integration)
```

`children` is still used, but at the **suite** level, for importing realms/packages — see
[suite](./suite.md).
