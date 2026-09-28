---
name: blong-model
description:
    Use the blong-browser model system to implement CRUD pages in a blong realm or suite. The model
    system generates Browse/New/Open/Report pages automatically from IModelSpec declarations. Use
    this skill whenever a realm needs to contribute UI pages for domain entities — even if the user
    just says "add list and edit pages for this entity" or "wire up the UI for this API". For
    developing or improving the model system internals, use blong-model-dev instead.
---

# blong-model Skill

> **Scaffold, don't transcribe.** Generate the spec with
> `kukum model add --subject=<realm> --object=<entity> --kind=model|fixture` (`[KUKUM_API]` in
> `_shared/conventions.md`) and edit the result.

## [CRITICAL_GUARDRAILS]

- **`type.uuid()` PKs** (not `uidNotNull()`/`increment()`) → auto-bound dropdowns + `core_resource`
  row + working generic CRUD. `uidNotNull()` does NOT.
- **Never use a single `saveAction` pointing to `.add` for `subjectObjectNew`** — duplicate records
  (see `_shared` `[PITFALLS]`).
- **`public: true` by default + per-operation override** — mark the model public to expose the CRUD
  endpoints on the gateway (without `subject.validation` the generic RPC routes aren't exposed and
  browse 404s). When ONE operation differs from the auto-generated one (e.g. `add` accepts extra
  params), keep the model public and add an explicit `gateway/<subject>/<method>.ts` validation
  override — do NOT make the model non-public.
- **Binary PK round-trip** — `uuid()` PKs are `binary(16)`: `get`/`find` return base64; dropdown
  values for binary PKs must be base64 too.
- **Model files end in `Model.ts`**, exported from a `{subject}{Object}Model` handler (`.model`
  kind) — that's what the portal orchestrator + mock adapter match on.

Canonical framework rules + pitfalls + archetype: `.github/skills/_shared/conventions.md` →
`[CRITICAL_GUARDRAILS]`, `[PITFALLS]`, `[ARCHETYPE: MODELSPEC]`. Sibling skills: **blong-browser**
(components), **blong-model-dev** (internals), **blong-core** (resource-backed tables).

## What this skill covers

**Using** the model system: declaring `IModelSpec` objects, wiring them into a realm component
handler, mock data for Storybook, and dropdown references. For internals see **blong-model-dev**;
for concept/architecture see
[blong-browser Model concept](../../docs/blong/docs/concepts/blong-model.md) and
[Model Pattern](../../docs/blong/docs/patterns/blong-model.md).

---

## Quick Summary

Add a model folder with model definitions to a realm. Models are discovered automatically by the
portal orchestrator and mock adapter via the `.model` file suffix convention:

```
realm/
  meta/
    model/
      subjectObjectModel.ts  <-- IModelSpec for the "object" entity
    fixture/
      subjectFixture.ts      <-- fixture data handler for Storybook/tests
```

> **Note:** The `meta/` folder name is a convention used in `blong-marine`. You can use any folder
> name — what matters is that model files end with `Model.ts` and are exported from a handler named
> `{subject}{Object}Model`. The `.model` suffix on the blong `model()` handler kind is what the
> portal orchestrator and mock adapter match on.

---

## Step 1 — Define a ModelSpec

Model specs use the `model()` factory from `@feasibleone/blong`. The factory wraps an async handler
function named `{subject}{Object}Model` that returns the spec. The `.model` kind is used by the
portal orchestrator and mock adapter to auto-discover the spec.

```typescript
// marine/meta/model/marineCoralModel.ts
import {model} from '@feasibleone/blong';

export default model(
    () =>
        async function marineCoralModel() {
            return {
                subject: 'marine',
                object: 'coral',

                schema: {
                    properties: {
                        coral: {
                            properties: {
                                coralId: {},
                                coralName: {title: 'Name', filter: true, sort: true},
                                familyId: {widget: {type: 'dropdown', dropdown: 'marine.family'}},
                                maxDepth: {title: 'Max Depth (m)'},
                                description: {widget: {type: 'textArea'}},
                            },
                        },
                    },
                },

                cards: {
                    browse: {
                        label: 'Coral',
                        widgets: ['coral'],
                    },
                    main: {
                        label: 'Coral Details',
                        className: 'col-12 md:col-8',
                        widgets: [
                            'coral.coralName',
                            'coral.familyId',
                            'coral.maxDepth',
                            'coral.description',
                        ],
                    },
                },

                layouts: {
                    edit: ['main'],
                },

                browser: {
                    title: 'Coral List',
                    icon: 'pi pi-star',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/marine.coral.new',
                            permission: 'marine.coral.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current',
                            method: 'component/marine.coral.open',
                            params: '${current}',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected',
                            confirm: 'Delete selected coral?',
                            method: 'marine.coral.remove',
                            params: {coralId: '${coralId}'},
                        },
                    ],
                },
            };
        },
);
```

Minimal valid spec — only `subject` and `object` are required; everything else falls back to
defaults based on the naming convention.

---

## Step 2 — Menu Wiring

Add a `.portal` file to register menu items:

```typescript
// marine/component/marine.portal.ts
import {handler} from '@feasibleone/blong';

export default handler(({handler: {portalMenuItem}}) => ({
    async 'marine.portal.params'() {
        return {
            menu: [
                {
                    title: 'Marine',
                    items: [
                        await portalMenuItem('marine.coral.browse'),
                        await portalMenuItem('marine.family.browse'),
                    ],
                },
            ],
        };
    },
}));
```

---

## Step 3 — Fixture Data for Storybook / Tests

The mock adapter generates all CRUD mock handlers from the handlers whose group name ends in
`.model` / `.fixture`. All you need is a fixture handler that returns sample data keyed by
`'{subject}.{object}'`:

```typescript
// marine/meta/fixture/marineFixture.ts
import {handler} from '@feasibleone/blong';

export default handler(
    () =>
        async function marineFixture() {
            // Return an object keyed by '{subject}.{object}' with arrays of items
            return {
                'marine.coral': [
                    {coralId: 1, coralName: 'Brain Coral', familyId: 1, maxDepth: 40},
                    {coralId: 2, coralName: 'Staghorn Coral', familyId: 2, maxDepth: 25},
                ],
                'marine.family': [
                    {familyId: 1, familyName: 'Acroporidae'},
                    {familyId: 2, familyName: 'Faviidae'},
                ],
            };
        },
);
```

> **Do NOT use the `fixture()` factory here.** `fixture()` from `@feasibleone/blong` describes mock
> **OpenAPI** documents (a `{subjects, dropdowns}` shape) and its type rejects the sample-rows
> object; the model fixture is an ordinary `handler()` named `{subject}Fixture`.

For larger datasets, load from YAML:

```typescript
// marine/meta/fixture/marineFixture.ts
import {handler} from '@feasibleone/blong';
import marineYaml from '../../data/marine.yaml?raw';

export default handler(
    ({lib: {yaml}}) =>
        async function marineFixture() {
            return yaml.parse(marineYaml);
        },
);
```

The mock adapter reads fixture data by calling `blong.handler['{subject}Fixture']({}, {})`. The mock
generates `find`, `get`, `add`, `edit`, `remove`, `report`, `schema`, and `{subject}.dropdown.list`
handlers automatically from the model spec and fixture data.

> **The realm's `browser.ts` must glob the fixture folder** (`./meta/fixture/**/*.ts`, beside
> `./meta/model/**/*.ts`). The browser platform loads a realm only through the `import.meta.glob`
> children it is given — it does not scan layer folders the way the server does — so a fixture that
> is declared but not globbed never reaches the mock adapter, and every story renders empty while
> `meta/model` looks perfectly fine. `kukum storybook add --kind=story` registers the folder in both
> `browser.ts` children lists itself, so a realm scaffolded and storied through kukum is already
> right; check the entry when a story you wrote by hand renders empty. Do NOT try to make that glob
> conditional: `import.meta.glob` is expanded at build time, so a glob in a module the app bundles
> ships the fixture in the app's own build even behind a branch that is never taken. The build draws
> the line instead — see the next note.
>
> **Fixtures are Storybook's data and do not reach the app.** `defineBlongViteConfig` (the app's
> Vite config) replaces every `meta/fixture` module with an empty handler, and
> `defineBlongStorybookMain` removes that plugin so Storybook loads the real file. That is why the
> glob stays in `browser.ts` — it is needed for the mock adapter either way — while the rows stay
> out of the app bundle. A realm whose app really needs its fixture at runtime (a live-backend
> Storybook, say) is the case the stubbing does not cover; the server is never affected, because it
> scans folders rather than globbing them, so `config.mock` keeps reading the real file.

**No `setupModelMock()` call is needed** — the mock adapter in blong-browser activates automatically
in `storybook` and `integration` environments when the `ui.mock` config key is present (set in
`.storybook/preview.tsx` via the `withBlong(browser)` decorator which passes `{ui: {mock: {}}}` as
config).

### Server-side model mocks — `config.mock` in `meta/db/db.ts`

The fixture above feeds the **browser** mock adapter. The **server** side has its own, independent
per-model switch: `config.mock` on the realm's `meta/db/db.ts` names the model handlers the shared
`srv.db` knex adapter should serve from fixture data instead of the database. `mock: true` mocks
every model, `mock: {<modelHandlerName>: true}` mocks only the named ones (a `RegExp` value matches
by pattern), and the omitted case is the real table:

```typescript
// demo/blong-marine/meta/db/db.ts — coral stays on the database, the rest are mocked
export default handler(() => ({
    config: {
        schema: {tables: {'marine.coral': 1, 'marine.family': 1, ...}},
        mock: {
            marineFamilyModel: true,
            marineSpeciesModel: true,
            marineHabitatModel: true,
        },
    },
}));
```

`demo/blong-marine` does this deliberately: coral is served by its MySQL table (seeded from
`meta/db/marineCoralMerge.yaml`, and pinned by its Playwright captures) while family, species and
habitat are served from `marineFixture`, so one suite covers the DB path **and** the mock path. A
realm that has no database at all — a CI leg without MySQL, or a Storybook pointed at a live dev
server (the mock/real toggle planned for `withBlong`, see `core/blong-browser`'s memory) — mocks
every model this way and still renders real pages.

The mocked models read the same `<subject>Fixture` handler the browser mock reads, so the fixture
and the seed must agree on the row _shape_ (they need not agree on key values); and because each
mocked model is served by `srv.db` rather than the table, a mocked model's rows can never come from
the seed.

---

## Step 4 — Storybook Stories

Use the `Model` component from `@feasibleone/blong-browser` to render model pages in stories. The
`page()` and `portal()` helpers from `@feasibleone/blong-browser/storyHelper` reduce boilerplate:

Then in story files:

```typescript
// marine/src/stories/Coral.stories.tsx
import type {Meta} from '@storybook/react-vite';
import {page} from '@feasibleone/blong-browser/storyHelper';

const meta: Meta = {title: 'Marine/Coral', parameters: {layout: 'fullscreen'}};
export default meta;

export const CoralBrowse = page('marine.coral.browse');
export const CoralOpen = page('marine.coral.open', 1); // open record #1
export const CoralNew = page('marine.coral.new');
export const CoralReport = page('marine.coral.report');

// Extra params override the default layout:
export const CoralOpenSplit = page('marine.coral.open', 1, {layout: 'editSplit'});
```

The `.storybook/preview.tsx` must use `withBlong(browser)` from
`@feasibleone/blong-browser/storybook.tsx`, and it must compose the realm's **composed** browser
entry (`index.browser.ts`) rather than the realm entry `browser.ts`:

```typescript
// .storybook/preview.tsx
import withBlong from '@feasibleone/blong-browser/storybook.tsx';
// The composed entry carries the portal port (blong-browser); through the realm
// entry alone a model story would render against an undefined portal.
import browser from '../index.browser.ts';

export default {
    decorators: [withBlong(browser)],
    parameters: {layout: 'fullscreen'},
};
```

This loads the full blong platform (including the mock adapter) in the browser, so stories work
without a running server. None of these three files are written by hand: `kukum storybook add`
(`[KUKUM_API]` in `_shared/conventions.md`) generates them, and the realm template `blong-kopi`
already ships them.

---

## Schema Overlay Reference

The `schema.properties.{object}.properties` map enriches server schema fields. Only specify the
fields you want to change — the rest come from the server.

### Field property overrides

| Property   | Type            | Effect                                                            |
| ---------- | --------------- | ----------------------------------------------------------------- |
| `title`    | string          | Label in form and column header                                   |
| `filter`   | boolean         | Add a filter input to the column (browse _and_ form/pivot tables) |
| `sort`     | boolean         | Make column sortable                                              |
| `required` | boolean         | Client-side required validation on save                           |
| `default`  | any             | Initial value for new entity create forms                         |
| `widget`   | IWidgetOverride | Widget type and configuration (see below)                         |

### Common widget configurations

```typescript
// Plain text (default for string fields)
{}

// Multi-line text area
{widget: {type: 'textArea'}}

// Date picker
{widget: {type: 'date'}}

// Integer (no decimals)
{widget: {type: 'integer'}}

// Single-select dropdown from named list
{widget: {type: 'dropdown', dropdown: 'marine.family'}}

// Multi-select dropdown
{widget: {type: 'multiSelect', dropdown: 'marine.habitat'}}

// Fixed options from schema enum (no dropdown fetch needed)
{type: 'string', enum: ['active', 'inactive'],
 widget: {type: 'select'}}

// Editable sub-table (vector-array)
{widget: {type: 'table', widgets: ['itemCode', 'quantity', 'price']}}
```

### Pivot grids (row × column details)

A `table` widget whose rows come from a **named dropdown** instead of the record is a _pivot grid_.
The dropdown supplies the row list (and the row label through `join`), the record detail supplies
the values, and a custom `add`/`edit` handler persists the submitted rows.

```typescript
capability: {
    items: {
        properties: {
            capabilityId: {},
            capabilityName: {title: 'Capability', readOnly: true},
            granted: {title: 'Granted', type: 'boolean'},
        },
    },
    widget: {
        type: 'table',
        pivot: {
            dropdown: 'access.capability',
            join: {value: 'capabilityId', label: 'capabilityName'},
            // Value of a freshly added row (any item field).
            defaults: {granted: true},
        },
        columns: ['capabilityName', 'granted'],
    },
}
```

Key points:

- `pivot.dropdown` names a key of the dropdown list (see the Dropdown Reference Convention below).
  `pivot.join` maps the row's key/label fields onto the dropdown's `value`/`label`, so the editor
  shows names while the payload carries ids. `pivot.examples` seeds static rows for Storybook or
  tests.
- A row can carry **more than one value column**, which is how a matrix is built: one row per
  labelled item and one column per setting. Cell widgets are the ordinary field overrides —
  `type: 'boolean'` for a checkbox, or a `select` with `options` for a tri-state cell (blank = "no
  setting", plus e.g. `allow` / `deny`). A cell may also be a `dropdown`, resolved from the same
  dropdown list as the row source.
- `filter: true` on a column adds a **filter input under its header** (see _Column filters_ below).
  It is what keeps a pivot usable once the row source grows — the ACL matrix lists every role, user
  and organization in the graph, so an administrator filters it down to the scope they are after,
  and a screenshot test can pin the one row it means to show.
- Read handlers must return the detail array in exactly the pivot's shape (row key + the value
  columns); write handlers receive the whole edited array and reconcile it with the stored state.
  See the ACL matrix in `realm/blong-access/meta/model/accessRoleModel.ts` (+ `accessModel.ts`
  `aclMatrixRows` / `syncAclMatrix`) for the worked example: rows are scopes, columns are the CRUD
  verbs, cells are `allow` / `deny` / blank, and saving syncs `access_acl` rows.

**A pivot matches its rows by the `join` fields**, so a read handler must produce the joined label
in _exactly_ the same form as the dropdown option label — otherwise no row matches, and the stored
data renders as a row of empty cells. The ACL matrix shares one `resourceLabel()` helper between the
dropdown list and `aclMatrixRows` for that reason.

### Column filters

`filter: true` on a field property renders an `InputText` under the column header with `data-testid`
`${tableId}-filter-${field}`, in **both** modes:

- **Browse / list tables** (`listAction`) — the committed value is sent to the server with the query
  (`filterBy`), so paging and the record total are filtered too.
- **Form and pivot tables** — the rows are filtered client-side with a case-insensitive `contains`
  on the cell's text. This is display-only: the form value keeps **every** row, so hiding a row can
  never drop data on save.

```typescript
// The ACL matrix is filtered down to one scope by the operator (and by tests)
targetName: {title: 'Scope', readOnly: true, filter: true},
```

### Cycle cells (click to advance the state)

A value column can be edited by **clicking the cell**, which advances it to the next state — no
row-edit mode, no edit button. Declare it on the field:

```typescript
// Named preset for the boolean cases
{granted: {title: 'Granted', widget: {type: 'cycle', cycle: 'tri-state'}}}

// Custom states (the ACL matrix: allow / deny / blank)
{get: {title: 'Get', widget: {
    type: 'cycle',
    states: [
        {value: 'allow', icon: 'pi pi-check text-green-500', label: 'Allow'},
        {value: 'deny', icon: 'pi pi-times text-red-500', label: 'Deny'},
        {value: null, label: 'Not set'},
    ],
}}}
```

- Presets: `tri-state` (check, cross, empty), `check-empty`, `check-cross`. With `states` you define
  the set yourself; the `null` state renders blank.
- Order matters: a click on an unset cell goes to the **first** state, then advances through the
  list and wraps back to it. The `label` is the cell's accessible name (its `title`), which is also
  what tests match on.
- The value is committed to the form straight away, so the form goes dirty the moment a cell is
  clicked — and a pivot whose editable columns are **all** cycle cells drops the row-edit column
  entirely (`cycleOnly`).
- The pivot `defaults` are the usual way to fix a column that should not be clicked at all (the ACL
  matrix fixes the entity that way and marks it `readOnly`, leaving only the verb columns to cycle).

---

## Dropdown Reference Convention

A dropdown is referenced by a `'subject.name'` key:

- `'marine.family'` — calls `marine.dropdown.list({name: 'marine.family'})` on the backend
- The backend handler returns `IDropdownOption[]` shaped as `[{value: id, label: '...'}]`
- Results are cached for the browser session

For **resource-backed** tables the knex adapter auto-binds `{subject}.dropdown.list` — the realm
does NOT need to implement it (see
[How the model system relates to `core.resource`](#how-the-model-system-relates-to-core-resource)
below). A realm only implements `{subject}.dropdown.list` itself for **non-resource** tables.

---

## How the model system relates to `core.resource`

`core.resource` = universal entity registry (`resourceId` PK + `resourceName` label, typed via
`core.type` alias `${subject}.${object}` — see **blong-core**). A **resource-backed table** has a
`type.uuid()` PK doubling as `core.resource.resourceId`; that one fact determines:

- **Dropdowns are auto-bound.** The knex adapter serves `{subject}.dropdown.list` for every
  resource-backed table directly from `core_resource JOIN core_type` (see `_dropdownList` in
  `core/blong-gogo/src/adapter/server/knex.ts`). No realm handler needed.
- **`add` auto-creates the resource row.** Generic knex `add` on a resource-backed table inserts the
  matching `core_resource` row; `merge` with `resourceType` + `name` idempotently resolves/creates
  it.
- **Seeds use `resourceType` + `name`** (e.g.
  `realm/blong-party/meta/dbTest/partyPersonMerge.yaml`).

Practical guidance for model authors:

- Use `type.uuid()` for entity primary keys (not `uidNotNull()` / `increment()`) to get dropdowns
  and graph identity for free.
- `keyField` (`${object}Id`) corresponds to `resourceId`; `nameField` (`${object}.${object}Name`)
  mirrors `core_resource.resourceName`.
- `uuid()` primary keys are `binary(16)` — base64 on the wire, so dropdown values for binary PKs
  must be base64 too (see authoring tricks below).

---

### Widget type resolution

Fields render according to their JSON Schema type (unless `widget.type` is set explicitly):

| Schema type | Widget                                                                    |
| ----------- | ------------------------------------------------------------------------- |
| `string`    | input / textArea / select / date / dateTime / time (by format/name)       |
| `integer`   | integer (InputNumber)                                                     |
| `number`    | number                                                                    |
| `bigint`    | bigint (BigIntWidget — preserves values beyond 2^53 as strings)           |
| `boolean`   | boolean (checkbox)                                                        |
| `anyOf`     | resolved from the first non-null member (e.g. `bigIntNotNull()` → bigint) |

A `bigint` column (`type.bigIntNotNull()` = `Union[BigInt, Integer]`) maps to `anyOf` in JSON
schema. The framework routes `bigint`/number-`anyOf` to the **BigIntWidget** (JS number within safe
range, string above it) — otherwise a plain text input submits a STRING and strict TypeBox
validation fails.

### Model & schema authoring tricks

- **`public: true` + `subject.validation`** — mark a model as public API with `public: true` and it
  gets default CRUD validations automatically (no config needed). A suite only opts out in rare
  cases: `srv: {'subject.validation': {validations: false}}` (all) or
  `{validations: {coralModel: false}}` (one model). Without the validation schemas the generic RPC
  routes aren't exposed and browse 404s. **Decision rule for a differing operation** (e.g.
  `invoice.invoice.add` accepts an optional `lines` payload): keep the model `public: true` and
  OVERRIDE only that operation with an explicit `gateway/<subject>/<method>.ts` validation file. The
  explicit file **replaces** the auto-generated `subject.validation` schema for that one operation
  (`subject.validation` registers first, so the later explicit file always wins) — the override's
  `params` are enforced as written and the model stays public, so the other CRUD operations keep
  their auto validation. Making the model non-public (manual gateway files for every op) is the last
  resort, not the default.

- **Master-detail (`IModelSpec.details`)** — for the common case of a public entity carrying detail
  arrays (invoice + `line`, + `payment`), declare the detail entities on the model and NO gateway
  override is needed. The model schema has a **dedicated key for the master record**
  (`schema.properties.invoice`) and one **sibling array property per detail**
  (`schema.properties.line`, `schema.properties.payment`) — the detail arrays live at the SAME level
  as the master object, and each sibling declares its own `items.properties` (the detail-row schema)
  right there:

    ```typescript
    export default model(
        () =>
            async function invoiceModel() {
                return {
                    subject: 'invoice',
                    object: 'invoice',
                    public: true,
                    schema: {
                        properties: {
                            invoice: {
                                // dedicated key for the master record
                                properties: {
                                    invoiceName: {title: 'Name'},
                                },
                            },
                            line: {
                                // sibling detail array, same level as `invoice`
                                items: {
                                    properties: {
                                        lineName: {type: 'string'},
                                        lineQuantity: {type: 'number'},
                                    },
                                },
                            },
                            payment: {items: {properties: {paymentAmount: {type: 'number'}}}},
                        },
                    },
                    details: [{object: 'line'}, {object: 'payment'}],
                };
            },
    );
    ```

    For each `details` entry the framework fills in `type: 'array'` + the editable-table widget on
    the sibling array property, plus a `details-<object>` card and an edit-layout tab. Result:
    - the auto `add`/`edit` validation accepts `{invoice: {...}, line: [...], payment: [...]}` — the
      detail arrays are SIBLINGS of the master object in the params (no manual `add` override),
    - the New/Open forms render one editable table per detail (TableWidget form-value mode:
      add/edit/delete rows), keeping the master record's own schema free of detail arrays (browse
      columns/DB schema unaffected).
    - **Persistence is generic** — the knex adapter (`core/blong-gogo/src/adapter/server/knex.ts`)
      treats any table with a FK constraint to the master's PK
      (`schema.constraints.foreign[col] === '<subject>.<object>.<key>'`) as a detail of that master:
      `add`/`edit` persist the sibling detail arrays and `get` returns them alongside the master.
      Declare the detail table in `meta/type/schema.ts` (FK column `type.bigIntNotNull()` for
      `increment()` PKs) + register it in `meta/db/db.ts`; no custom `adapter/db/<object>Add.ts`
      handler is needed. A manual gateway override remains the escape hatch for non-array extras.
    - **Playwright**: pass `details: [{object: 'line', fields: {...}, rows}]` to
      `createAndEditModel` (`@feasibleone/blong-browser/playwright/model`) to switch to each detail
      tab, add/fill rows and capture `*-tab-<detail>-{empty,filled,open}.png` screenshots.

- **Browse `orderBy` shape** — the browse widget sends `orderBy` as an array of `{field, dir}`; the
  `find` handler must tolerate array-of-`{field, dir}` OR a plain `order` string.
- **`type.uuid()` vs `type.uidNotNull()`** — `type.uuid()` (default literal `'uuid'`) lets the
  generic knex `add` auto-generate the PK and a backing `core_resource` row; `uidNotNull()` does
  not. Use `uuid()` for entity PKs so generic CRUD create works.
- **Binary PK round-trip** — `type.uuid()` PKs are `binary(16)`; `get`/`find` return them base64.
  Dropdown values for binary PKs must also be base64, or the edit form won't match the current
  value.
- **Generic CRUD binary columns** — the framework's `discoverBinaryColumns` matches both `binary`
  and `varbinary(16)`; the `edit` exec converts binary columns back. Without this, generic CRUD
  fails with "Data too long".

## Cards Reference

```typescript
cards: {
    main: {
        label:     'Main Details',     // card heading (omit for no heading)
        className: 'col-12 md:col-8',  // PrimeFlex column class
        widgets:   [                   // fields to render, in order
            'entity.fieldName',
            ['entity.from', 'entity.to'], // two fields on same row
        ],
        permission:  'some.permission', // hide if user lacks this permission
        hidden:      false,             // render as hidden inputs
        collapsible: true,              // add collapse/expand toggle
    },
}
```

---

## Layouts Reference

```typescript
// Flat — column array (default for most cases)
layouts: {edit: ['main', 'notes']}
// Two cards in the same column (stacked):
layouts: {edit: ['main', ['notes', 'extra']]}

// Tabbed
layouts: {
    edit: {
        items: [
            {id: 'details', label: 'Details', icon: 'pi pi-id-card', widgets: ['main']},
            {id: 'notes',   label: 'Notes',   icon: 'pi pi-file',    widgets: ['notes']},
        ],
    },
}

// ThumbIndex sidebar
layouts: {
    edit: {
        orientation: 'left',
        items: [
            {id: 'groupA', label: 'Group A', icon: 'pi pi-cog',  widgets: ['main', 'extra']},
            {id: 'groupB', label: 'Group B', icon: 'pi pi-user', widgets: ['contact']},
        ],
    },
}
```

---

## Browser Config Reference

```typescript
browser: {
    title: 'Corals',        // browse tab title and menu label
    icon:  'pi pi-star',    // PrimeIcon class
    permission: {
        browse: 'marine.coral.browse',  // required to open the browse page
        add:    'marine.coral.new',     // shows "Create" button when present
        edit:   'marine.coral.open',    // shows row edit control
        delete: 'marine.coral.remove',  // shows row delete (when implemented)
    },
    filter: {isActive: true}, // default params passed to listAction on open
}
```

---

## Method Overrides

```typescript
methods: {
    find:   'marine.coral.search',  // non-standard list method
    report: 'marine.report.coral',
}
```

All six method names default to `{subject}.{object}.{find|get|add|edit|remove|report}`.

> **Tip — avoid duplicate records:** `subjectObjectNew` uses `createAction` (`.add`) for the first
> save only, then switches to `mode='edit'` + `saveAction` (`.edit`). Never use a single
> `saveAction` pointing to `.add` — see `_shared` `[PITFALLS]`.

---

## Report Page

```typescript
report: {
    title:      'Coral Report',
    permission: 'marine.coral.report',
}
```

Omit the `report` property entirely to skip generating the report page.

---

## Mixing Model and Custom Pages

The model handles standard CRUD. For pages with custom logic, add a separate component handler file
with the `.component` suffix in a component layer. The portal orchestrator discovers both model
handlers (`.model` suffix) and component handlers (`.component` suffix) automatically:

```typescript
// marine/component/marineCoralImport.component.ts
import {handler} from '@feasibleone/blong';

export default handler(() => ({
    'marine.coral.import': async () => ({
        title: 'Import Corals',
        permission: 'marine.coral.import',
        component: async () => {
            const {CoralImport} = await import('./CoralImport.js');
            return CoralImport;
        },
    }),
}));
```

Both model handlers (`.model` files in `meta/model/`) and component handlers (`.component` files)
are discovered and loaded by the portal orchestrator together.
