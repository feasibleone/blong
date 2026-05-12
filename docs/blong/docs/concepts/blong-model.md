# Model System

The **model system** is the primary way that application realms contribute
user interface pages to a blong suite. It sits one level above the raw
`Editor`, `Explorer` and `Report` components, providing a declarative
specification layer (`IModelSpec`) from which complete CRUD pages are
generated automatically.

For the wider rationale see [Metadata-Driven UI](../rationale/metadata-driven-ui.md).

For usage patterns see [Schema based UI](../patterns/blong-model.md).

---

## Role in the Architecture

```text
Realm
  └── meta/
        ├── model/
        │     ├── subjectCoralModel.ts   ← IModelSpec handler (model() factory)
        │     ├── subjectFamilyModel.ts
        │     └── …
        └── fixture/
              └── subjectFixture.ts      ← fixture data handler for Storybook/tests
```

Each model handler (`.model` kind, discovered via `/\.model$/` regex) produces four discoverable
page handlers registered in the portal component namespace:

| Handler name                | Page type | Component |
| --------------------------- | --------- | --------- |
| `{subject}.{object}.browse` | List view | `Editor` (browse layout) |
| `{subject}.{object}.new`    | Create    | `Editor`  |
| `{subject}.{object}.open`   | Edit/view | `Editor`  |
| `{subject}.{object}.report` | Report    | `Report`  |

The report page is optional — it is only registered when `report.permission`
is defined in the model.

> **Browse page:** The browse page uses `Editor` in `layout: 'browse'` mode — not the standalone
> `Explorer` component. The default browse layout is a 3-panel split with a tree navigator, a main
> table, and a detail preview panel.

---

## What a ModelSpec Contains

An `IModelSpec` describes **one domain entity** from the browser's perspective.
It is declared using the `model()` factory from `@feasibleone/blong`, which wraps
an async handler function returning the spec object:

```typescript
import {model} from '@feasibleone/blong';

export default model(
    () =>
        async function marineCoralModel() {
            return {subject: 'marine', object: 'coral', /* ... */ };
        },
);
```

The spec has three concerns:

### 1. Identity

```text
subject.object   →  "marine.coral"
objectTitle      →  "Coral"    (defaults to capitalized object)
keyField         →  "coralId"  (defaults to ${object}Id)
```

### 2. Schema Overlay

The server OpenAPI schema for `subject.object.find` and `subject.object.get`
is fetched at runtime. The model's `schema` property provides a browser-side
overlay that enriches the server schema with display hints:

- Widget type overrides (`type: 'dropdown'`, `type: 'date'`)
- Named dropdown references (`dropdown: 'marine.family'`)
- Filter and sort flags
- Field title overrides
- Required / validation overrides

The overlay is **merged** on top of the server schema; it does not replace it.
Fields not mentioned in the overlay receive server-schema defaults.

### 3. Presentation Configuration

- **`cards`** — named groups of fields, each with an optional label and
  PrimeFlex layout class. Cards form the building blocks of the Editor layout.
- **`layouts`** — how cards are arranged on the edit page: flat columns,
  tabbed navigation, steps, or left-sidebar (ThumbIndex) navigation.
- **`browser`** — browse page title, icon, permission keys, and an optional
  default filter applied on page open.
- **`report`** — report page title and permission key.
- **`methods`** — override the inferred API method names
  (`${subject}.${object}.find`, `.get`, `.add`, `.edit`, `.remove`, `.report`).

---

## Schema Flow

```text
IModelSpec.schema overlay (static, in code)
       │
       ▼
{subject}.{object}.schema handler (runtime, from backend — returns {} if none)
       │
       ▼
blong.lib.merge(model.schema, schemaOverride)
       │
       ▼
IEnrichedSchema  (passed to Editor / Report)
       │
       ├─▶  Editor browse layout (table + navigator + detail)
       ├─▶  Editor form cards + widgets
       └─▶  Report filter + table
```

The schema is fetched per page invocation via the `{subject}.{object}.schema` handler
(not a static HTTP fetch). The handler returns runtime customisations (e.g. tenant-specific
design overrides stored in the database) and `{}` when no overrides exist. The merge order
gives `schemaOverride` highest priority over the static `model.schema`.

---

## Dropdown Registry

Fields declared with `widget: {type: 'dropdown', dropdown: 'marine.family'}`
are resolved by calling `{subject}.dropdown.list` on the backend.
In development / Storybook the mock adapter auto-generates
`{subject}.dropdown.list` from fixture data, synthesising `{value, label}` pairs
using each model's `keyField` and `nameField`.

The `dropdownRegistry` singleton (exported from `@feasibleone/blong-browser`)
deduplicates concurrent loads and caches results for the browser session.

---

## Preview and Testing

The mock adapter (`adapter/mock.ts` in blong-browser) activates in `storybook` and `integration`
environments and auto-generates all CRUD handlers from `.model` and `.fixture` handlers. No manual
mock setup is needed — add a fixture handler named `{subject}Fixture` that returns sample data
keyed by `'{subject}.{object}'`.

The `Model` React component (exported from `@feasibleone/blong-browser`) is the canonical way to
render model pages in Storybook stories. It uses the full blong platform (loaded via
`withBlong(browser)` in `.storybook/preview.tsx`) so all handlers are available.

See `core/ui-demo/` for a working Storybook example using the marine biology realm.

---

## Relationship to Raw Components

The model system is a *convenience layer* built on top of the same components
that are available for direct use. When a page requires custom logic that the
model cannot express, a realm can write a component handler (`.component` suffix)
that uses `Editor`, `Explorer`, or `Report` directly.

The model handles the 80 % case. The remaining 20 % uses the underlying
components with hand-crafted props. Both approaches coexist naturally within
the same realm — component handlers and model handlers are both discovered
by the portal orchestrator.
