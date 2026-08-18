# Blong Shared Conventions

Single canonical home for cross-cutting framework rules. This file is **not a skill** (no `SKILL.md`, no
frontmatter → never registered/loaded). Skills LINK here instead of duplicating content.

---

## [CRITICAL_GUARDRAILS]

Framework-level hard rules. Every skill assumes these. Apply first; never contradict.

- **Never import handlers directly.** Cross-handler deps go through the `handler()` proxy
  (`runtime.handler`). Direct imports break IoC + hot reload + mocking.
- **Semantic triple naming** `subjectObjectPredicate`. File = exported fn = wire-format method.
  Singular subject/object, present-tense predicate.
- **Standard predicates prioritized.** `get`/`find`/`add`/`edit`/`remove`/`merge` (single entity);
  `insert`/`update`/`delete` (bulk). Never invent predicates.
- **Always forward `$meta`** as the 2nd argument through every handler call (auth/tracing/transport).
- **One handler per file.** File name = exported fn name = triple.
- **Hierarchy never skipped.** suite → realm → layer → handler group → handler.
- **Two-word properties.** `userName` not `name`; `customerId` not `id`; `emailAddress` not `email`.
- **Adapters never call adapters directly.** Coordinate via orchestrators.
- **[REUSE_SERVER]** Realms reuse blong-server's subject orchestrator + db adapter. Do NOT create a
  realm-local `adapter/db.ts` or a dispatch orchestrator; contribute
  `orchestrator/subject/init.ts` (namespace) + `adapter/db/*.ts` handlers + `meta/`.
- **[DB_ACCESS]** DB persistence handlers live in `adapter/db/` and reach the shared knex pool via
  `this.config?.context?.queryBuilder` — not in `orchestrator/`.
- **Never enable `systemDebug` in production.**
- **Never commit to `dev/`** (gitignored).

---

## [ANCHOR_TOKENS]

Voluntary code-search markers. Add at model discretion where they aid locating implementations
(canonical examples, stubs). **Never enforced.**

```typescript
// @framework-archetype: HANDLER
// @framework-skills: blong-handler, blong-validation
```

---

## [ARCHETYPE: HANDLER]

```typescript
import {handler} from '@feasibleone/blong';

export default handler(({lib, errors, config, handler}) =>
    async function subjectObjectPredicate(
        params: Parameters<Handler>[0],
        $meta: IMeta,
    ): ReturnType<Handler> {
        // business logic — forward $meta on every downstream call
    },
);
```

Rule: destructure `lib` / `errors` / `config` / `handler` from the runtime arg; never import other
handlers. Optional `Handler` type (`~.schema.ts`) enables automatic validation + OpenAPI docs.

---

## [ARCHETYPE: ADAPTER_HTTP]

```typescript
import {adapter} from '@feasibleone/blong';

export default adapter.http({
    activation: {url, namespace, imports},
    // co-located config, validated via TypeBox
});
```

Rule: adapters translate semantic-triple internal API ↔ external system API; self-contained
(`activation` config co-located in the layer file).

---

## [ARCHETYPE: ORCHESTRATOR_DISPATCH]

```typescript
import {orchestrator} from '@feasibleone/blong';

export default orchestrator.dispatch({
    activation: {namespace, imports},
});
```

Rule: orchestrators coordinate business logic across adapters; namespace becomes a Kubernetes
service in microservice mode. **Realms normally REUSE blong-server's `subject` orchestrator** (which
forwards to the `db` destination) — they only add `orchestrator/subject/init.ts` with a `namespace`.
A realm-local dispatch orchestrator is only needed for a genuinely different routing shape.

---

## [ARCHETYPE: SCHEMA_TABLE]

```typescript
// meta/type/schema.ts
const product = type.Object({
    productId: type.increment(),
    productName: type.stringNotNull({maxLength: 200}),
    sku: type.stringNotNull({maxLength: 50}),
    unitPrice: type.numberNull(),
    // constraints: {primaryKey, foreignKey, unique} declared in options
});
// meta/db/db.ts tables: {order, name}
// seeds: meta/db/*.yaml — ALWAYS YAML, never TypeScript
```

Rule: use convenience types (`type.increment()`, `type.stringNotNull()`, …), never raw TypeBox;
seeds are YAML only.

---

## [ARCHETYPE: MODELSPEC]

```typescript
import type {IModelSpec} from '@feasibleone/blong-browser';

const spec: IModelSpec = {
    browse: {...}, new: {...}, open: {...}, report: {...},
    // dropdowns: {field: {values: [{value, label}]}}
};
```

Rule: browse/new/open/report pages auto-generate from one `IModelSpec`; see blong-model.

---

## [PITFALLS]

- **`createAction` / `saveAction` duplicate-record.** Never configure `subjectObjectNew` with a single
  `saveAction` that both creates and the browse page treats as editable — causes duplicate rows on
  second save. Use distinct create vs edit actions.
- **Inline title object infinite loop.** Don't pass an inline object as `title` in a spec/card — the
  editor re-renders on every keystroke and loops. Reference a stable value instead.
- **`Cannot destructure property 'x' of (intermediate value) as it is undefined`** — a dependent
  step destructures the previous step's RETURN value; chain steps must return the expected shape.

---

## [LAYER_DEFAULTS_TABLE]

Well-known folders auto-activate at their default intent — no `layer.*.ts` needed. This table mirrors
`WELL_KNOWN_LAYERS` in `core/blong-gogo/src/load.ts` (the source of truth). `default` = always active;
`integration` = active under the `integration` intent (the default CLI intents are
`dev + microservice + integration`, so these are active in practice).

| Folder | Server intent | Browser intent |
| --- | --- | --- |
| `api` | `default` | `default` |
| `init` | `default` | `default` |
| `meta` | `default` | `default` |
| `error` | `integration` | — |
| `sim` | `integration` | — |
| `adapter` | `integration` | — |
| `orchestrator` | `integration` | — |
| `gateway` | `integration` | — |
| `backend` | — | `integration` |
| `component` | — | `integration` |
| `action` / `actions` | — | `integration` |
| `test` | — | `integration` |
| `server/api` | `integration` | — |
| `server/init` | `default` | — |
| `server/test` | `integration` | — |
| `browser/api` | — | `integration` |
| `browser/init` | — | `default` |
| `browser/test` | — | `integration` |
| `browser/orchestrator` | — | `integration` |

> Server tap tests live in `server/test/`; browser tap tests in `browser/test/`; the top-level `test/`
> folder is a browser layer holding Playwright `*.play.ts`.

Custom folder names require a `layer.server.ts` / `layer.browser.ts`.

---

## [CONFIG_EXAMPLE]

```typescript
// layer file — self-contained
export default layer({
    default: true,        // active in all intents
    microservice: true,   // additionally active under microservice intent
});
```

Rule: adapter/orchestrator `activation` config lives in the layer file, NOT the realm `server.ts`.
Realm `server.ts` only for config shared across layers.

---

## [FRONTMATTER_TEMPLATE]

```yaml
---
name: <skill-name>
description: <one-line trigger — task + when to use>. Use this skill whenever <task> — even if the user just says "<short phrase>". Cross-reference sibling skills when routing (e.g. "for X use <sibling>").
---
```

- One serialization style: single-line `description: …`.
- One trigger phrasing: `Use this skill whenever …`.
- `name` must equal the skill folder name.
