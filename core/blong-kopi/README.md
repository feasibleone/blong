# blong-kopi — Realm scaffolding template

`@feasibleone/blong-kopi` is the template used to scaffold a new **realm**. A
scaffolded realm is a complete, runnable starting point that **reuses the
`@feasibleone/blong-server`** subject orchestrator and db adapter (the canonical
pattern used by `blong-access`, `blong-party`, `blong-gateway`).

## Creating a realm

### Explicit CLI (recommended for agents/humans)

```bash
blong realm <name>              # create is implied
blong create realm <name>       # explicit form
blong realm <name> --object entry   # entity ("object" of the triple), default `entry`
```

The new realm folder is created in the current directory and then loaded/run
(`index.ts` starts a gateway + dev server with the realm's tap/Playwright tests).

### Auto-trigger (implicit, framework)

When a suite declares a realm child whose folder does not exist yet, and
`kopi.realm` is enabled in config (`.blong_devrc`), the framework scaffolds the
realm on the fly and then loads it:

- a realm child import fails with `MODULE_NOT_FOUND`
- `mergedConfig.kopi.realm` is truthy
- the missing folder is not a well-known layer
- no `package.json` exists at the target folder

## What gets scaffolded

```text
server.ts, browser.ts          minimal realm entries (layers auto-discovered)
orchestrator/subject/init.ts   subject namespace — REUSE blong-server (no own dispatcher)
browser/orchestrator/subject/init.ts  browser namespace (folder `subject` stays literal)
meta/type/schema.ts            TypeBox table schemas (header + line detail)
meta/db/db.ts                  table registration + dbTest
meta/dbTest/*.yaml             test seeds + RBAC seed (non-dotted capability names)
meta/model/$subject$ObjectModel.ts   public model spec (drives Browse/New/Open)
adapter/db/$subject$ObjectAdd.ts     custom DB handler (queryBuilder) — master-detail add
gateway/$subject/$subject$ObjectAdd.ts  PUBLIC-MODEL OVERRIDE example (keep model public)
server/test/test/test$Object.ts       server tap flow (login + add + find)
browser/test/test/test$Object.flow.ts browser HTTP-level access-control flow
test/$subject.play.ts          Playwright (cleanupModel + browse + create/edit)
index.ts, index.browser.ts, index.html.ts, browser-test.ts, index.test.ts
vite.config.ts, playwright.config.ts
```

## After scaffolding — the rename steps

1. **Entity (`entry` → your object).** The default entity is `entry` (a single
   noun = the "object" of `subjectObjectPredicate`). Rename `entry` everywhere
   to your entity (e.g. `invoice`), and the child table `line` to your detail
   entity (e.g. keep `line`). Field names are prefixed with the entity
   (`entryName` → `invoiceNumber`, …).
2. **Package name.** Set `package.json` `name` to `@feasibleone/blong-<realm>`
   and `version` to `0.1.0`; add the package to the monorepo `rush.json` and run
   `rush update`.
3. **Ports.** `playwright.config.ts` uses `backendPort: 9003` /
   `frontendPort: 9103` — change if they clash with a locally-running realm.
4. **Plural labels.** The model `browser.title` / `cards.browse.label` use
   `$Objects` — adjust the plural for your entity.

## Conventions baked in

- **Reuse blong-server**: do NOT create a realm-local `adapter/db.ts` or a
  dispatch orchestrator. Contribute `orchestrator/subject/init.ts` (namespace),
  `adapter/db/*.ts` handlers (`this.config?.context?.queryBuilder`), and `meta/`.
- **Server-managed audit fields are nullable** (`createdAt: type.dateTimeNull()`)
  — the gateway auto-validates CRUD against `NotNull` columns.
- **FK typing**: `type.increment()` PKs are BIGINT UNSIGNED; FK columns must be
  `type.bigIntNotNull()`. Avoid chained knex FK options.
- **Public model + per-op override**: models are `public: true`; a differing
  operation (e.g. `add` with `details`) is overridden by an explicit
  `gateway/<subject>/<method>.ts` validation file — do NOT make the model
  non-public.
- **Capability names** in RBAC seeds are the non-dotted handler names.
