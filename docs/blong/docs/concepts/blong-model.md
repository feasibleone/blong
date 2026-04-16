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
  └── model/
        ├── coral.ts        ← IModelSpec declaration
        ├── family.ts
        └── mock.ts         ← Storybook/test mock data
```

Each model entry produces four discoverable page handlers:

| Handler name                | Page type | Component |
| --------------------------- | --------- | --------- |
| `{subject}.{object}.browse` | List view | `Explorer`|
| `{subject}.{object}.new`    | Create    | `Editor`  |
| `{subject}.{object}.open`   | Edit/view | `Editor`  |
| `{subject}.{object}.report` | Report    | `Report`  |

The report page is optional — it is only registered when `report.permission`
is defined in the model.

---

## What a ModelSpec Contains

An `IModelSpec` describes **one domain entity** from the browser's perspective.
It has three concerns:

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
Server TypeBox schema
       │
       ▼
GET /rpc/{subject}/openapi.json  (schemaFetcher, cached per subject)
       │
       ▼
Extract params/result for each operationId
       │
       ▼
Merge browser IModelSpec overlay
       │
       ▼
enrichSchema() → IEnrichedSchema
       │
       ├─▶  Explorer columns
       ├─▶  Editor Form cards + widgets
       └─▶  Report filter + table
```

The schema is fetched and enriched once per subject, then cached for the
lifetime of the browser session. All pages for all objects under the same
subject share a single HTTP request.

---

## Dropdown Registry

Fields declared with `widget: {type: 'dropdown', dropdown: 'marine.family'}`
are tracked automatically. When a page mounts, the framework calls
`{subject}.dropdown.list({name: 'marine.family'})` on the backend to
fetch `[{value, label}]` pairs and caches the result in `dropdownRegistry`.

All widgets on the same page that reference the same dropdown name share
a single request. Subsequent pages use the cached data without re-fetching.

---

## Preview and Testing

The `setupModelMock()` function overrides the schema fetcher and pre-populates
the dropdown registry with static data. This is used in Storybook stories and
unit tests to develop and verify model-driven pages without a running server.

Each model folder conventionally exports a `mock.ts` file that contains the
mock OpenAPI schema and dropdown data for that realm's entities.

---

## Relationship to Raw Components

The model system is a *convenience layer* built on top of the same components
that are available for direct use. When a page requires custom logic that the
model cannot express, a realm can bypass `modelFactory()` and write a
component handler that uses `Editor`, `Explorer`, or `Report` directly.

The model handles the 80 % case. The remaining 20 % uses the underlying
components with hand-crafted props. Both approaches coexist naturally within
the same realm's `component/` folder.
