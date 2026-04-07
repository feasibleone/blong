---
name: blong-ui-model-dev
description: >
    Develop, extend, debug, or improve the blong-ui model system internals. The model system lives
    in `core/blong-ui/src/model/` and provides the `createModelHandlers()` factory that
    auto-generates Browse/New/Open/Report pages from IModelSpec declarations. Use this skill when
    working on the model system itself: createModelHandlers, entry files
    (subjectObjectBrowse/New/Open/Report), IModelSpec types, withDefaults, schemaFetcher,
    dropdownRegistry, or the mock system. For using the model to build realm pages, use the
    blong-ui-model skill instead.
---

# blong-ui-model-dev Skill

## What this skill covers

The model system (`core/blong-ui/src/model/`) is the highest-level abstraction in blong-ui. It
generates complete CRUD pages from declarative `IModelSpec` objects. This skill is for **developing
and improving the model system itself**.

For describing what the model is conceptually, see:

- [blong-ui Model concept](../../docs/blong/docs/concepts/blong-ui-model.md)

For using the model in realm development, use the **blong-ui-model** skill.

---

## File Map

```
core/blong-ui/src/model/
  types.ts                ← All TypeScript types (IModelSpec, IResolvedModelSpec, etc.)
  defaults.ts             ← withDefaults() — fills in standard values for partial specs
  schemaFetcher.ts        ← Per-subject OpenAPI fetch + overlay merge + cache
  dropdownRegistry.ts     ← On-demand dropdown load + deduplication + cache
  createModelHandlers.ts  ← componentHandler factory — the public entry point
  mock.ts                 ← setupModelMock() / teardownModelMock() for Storybook/tests
  index.ts                ← Public re-exports
  entries/
    subjectObjectBrowse.ts  ← Browse page entry factory
    subjectObjectNew.ts     ← New (create) page entry factory
    subjectObjectOpen.ts    ← Open (edit) page entry factory
    subjectObjectReport.ts  ← Report page entry factory (optional)
    entries.test.ts         ← Unit tests for all entry factories
  defaults.test.ts          ← Unit tests for withDefaults
  schemaFetcher.test.ts     ← Unit tests for schemaFetcher
  mock.test.ts              ← Unit tests for mock setup
```

---

## Key Types (`types.ts`)

```typescript
/** The input spec provided by realm developers */
interface IModelSpec {
    subject: string; // namespace, e.g. 'marine'
    object: string; // entity, e.g. 'coral'
    objectTitle?: string; // defaults to capital(object)
    keyField?: string; // defaults to '${object}Id'
    nameField?: string; // defaults to '${object}.${object}Name'
    schema?: ISchemaOverlay;
    cards?: Record<string, ICardOverride>;
    layouts?: Record<string, LayoutConfig>;
    browser?: IBrowserConfig;
    methods?: IMethodsConfig;
    report?: IReportConfig;
}

/** Fully resolved spec after withDefaults() — all fields guaranteed present */
interface IResolvedModelSpec {
    subject: string;
    object: string;
    objectTitle: string;
    keyField: string;
    nameField: string;
    browser: Required<IBrowserConfig>;
    methods: Required<IMethodsConfig>;
    // ... cards, layouts, schema, report (with defaults)
}

/** Named dropdown {value, label} pair */
interface IDropdownOption {
    value: unknown;
    label: string;
}
```

---

## `withDefaults()` (`defaults.ts`)

Fills in standard values for every optional field. Key defaults:

| Field                  | Default value                                     |
| ---------------------- | ------------------------------------------------- |
| `objectTitle`          | `capital(object)` — `'coral'` → `'Coral'`         |
| `keyField`             | `'${object}Id'`                                   |
| `nameField`            | `'${object}.${object}Name'`                       |
| `methods.find`         | `'${subject}.${object}.find'`                     |
| `methods.get`          | `'${subject}.${object}.get'`                      |
| `methods.add`          | `'${subject}.${object}.add'`                      |
| `methods.edit`         | `'${subject}.${object}.edit'`                     |
| `methods.remove`       | `'${subject}.${object}.remove'`                   |
| `methods.report`       | `'${subject}.${object}.report'`                   |
| `browser.title`        | `capital(object)` + `'s'` plural                  |
| `browser.permission.*` | `'${subject}.${object}.{browse/add/edit/delete}'` |

The `deepMerge()` helper in `defaults.ts` deeply merges plain objects, overwriting arrays and
primitives. It is also exported for use elsewhere in the model system.

---

## `schemaFetcher.ts`

Fetches and caches the OpenAPI document for a subject, then extracts and merges schema overlays.

### Public API

```typescript
// Fetch raw operationId → {params, result} map for a subject (cached per subject)
getSubjectApi(subject: string): Promise<Record<string, IOperationSchema>>

// Get the merged IEnrichedSchema for a subject.object (browser overlay applied)
getObjectSchema(
    subject: string,
    object: string,
    browserOverlay: Record<string, unknown>
): Promise<Record<string, unknown>>

// Override base URL for fetching (default: '')
setBaseUrl(url: string): void

// Override the fetch function entirely (used by setupModelMock)
setFetchFn(fn: (url: string) => Promise<unknown>): void
```

### Schema extraction logic

1. Fetch `GET {baseUrl}/rpc/{subject}/openapi.json`
2. From `paths`, find the operation matching `{subject}.{object}.find`
3. Extract the `params` JSON Schema from
   `requestBody.content.application/json.schema.properties.params`
4. Extract the `result` JSON Schema from
   `responses.200.content.application/json.schema.properties.result`
5. Read `x-ui-customizations['{subject}.{object}']` from the top-level document for server-stored
   design overrides
6. `deepMerge(serverSchema, browserOverlay, serverCustomizations)` in that priority order

### Cache behaviour

The subject API map is cached as a `Promise` in a module-level `Map`. Setting a new fetch function
via `setFetchFn()` clears both caches (subject API + UI customizations). This ensures the mock setup
in tests always gets a clean state.

---

## `dropdownRegistry.ts`

Singleton that deduplicates concurrent dropdown loads and caches results.

### Public API

```typescript
class DropdownRegistry {
    // Load (or return cached) dropdown by name
    get(
        name: string,
        loader: (name: string) => Promise<IDropdownOption[]>,
    ): Promise<IDropdownOption[]>;
    // Pre-populate without async loading (mocks, preload)
    set(name: string, data: IDropdownOption[]): void;
    // Batch preload — calls batchLoader once with all names
    preload(
        names: string[],
        batchLoader: (names: string[]) => Promise<Record<string, IDropdownOption[]>>,
    ): Promise<void>;
    // Check if already cached (avoids redundant get() calls)
    has(name: string): boolean;
    // Clear all caches (used by teardownModelMock)
    clear(): void;
}
export const dropdownRegistry: DropdownRegistry;
```

The loader convention: `dropdownRegistry.get('marine.family', loader)` where `loader(name)` calls
`{subject}.dropdown.list({name})` on the backend. The `subject` is extracted as the first segment of
the dropdown name (`'marine.family'` → subject `'marine'`).

---

## Entry Files (`entries/`)

Each entry file exports a factory function that takes a resolved model and a schema loader, and
returns an async function compatible with the `componentHandler` entries map.

### Signature pattern

```typescript
export function subjectObjectBrowse(
    model: IResolvedModelSpec,
    loadSchema: () => Promise<IEnrichedSchema>,
): (params?: Record<string, unknown>) => Promise<{
    title: string;
    permission: string;
    icon?: string;
    component: (params: Record<string, unknown>) => Promise<React.ComponentType>;
}>;
```

### Current implementations

**`subjectObjectBrowse`** — `Explorer` with:

- `listAction` from `model.methods.find`
- `columns` derived from `model.cards.browse.widgets` (field name after last `.`)
- A "Create" toolbar button pointing to `{subject}.{object}.new`
- Single selection mode

**`subjectObjectNew`** — `Editor` with:

- `saveAction` from `model.methods.add`
- `editMode: true, editable: false` (always in edit mode, no toggle)
- `cards` and `layouts` from model

**`subjectObjectOpen`** — `Editor` with:

- `loadAction` from `model.methods.get`
- `loadParams` contains `{[keyField]: params[keyField]}`
- `saveAction` from `model.methods.edit`
- `editable: true` (shows Edit/Save/Reset toolbar)

**`subjectObjectReport`** — `Report` with:

- `listAction` from `model.methods.report`
- Only registered when `model.report?.permission` is truthy

---

## `createModelHandlers.ts`

The public factory exported from `@feasibleone/blong-ui`.

```typescript
createModelHandlers(models: IModelSpec[]): ReturnType<typeof componentHandler>
```

For each model:

1. Calls `withDefaults(model)` to produce `IResolvedModelSpec`
2. Defines a `loadSchema()` closure: `getObjectSchema(subject, object, overlay)` + `enrichSchema()`
3. Registers four entries using the factory functions from `entries/`
4. Skips the report entry if `model.report?.permission` is falsy

---

## `mock.ts`

```typescript
setupModelMock(options?: IModelMockOptions): void
teardownModelMock(): void
```

`IModelMockOptions`:

- `subjects` — map of subject name → minimal OpenAPI doc shape
- `dropdowns` — map of dropdown name → `IDropdownOption[]`

`setupModelMock` calls `setFetchFn()` with a function that intercepts `/rpc/{subject}/openapi.json`
requests and returns the corresponding mock doc. It also pre-populates `dropdownRegistry` via
`registry.set()`.

`teardownModelMock` restores the default `fetch`-based fetcher and clears the dropdown registry.

---

## Known Unfinished / Improvement Opportunities

The following are areas where the model system has known gaps. When a feature request touches one of
these, implement it as part of the model:

1. **Browse "Open" on row click** — The Explorer generated by `subjectObjectBrowse` does not
   automatically open `{subject}.{object}.open` when a row is clicked. This needs an `onSelect` prop
   wired to a `portal.tab.show` action call.

2. **Delete action** — No model-level delete confirmation dialog. The browse page should support a
   Delete button on the selected row when `browser.permission.delete` is set.

3. **Dropdown preload on browse** — The browse page does not preload dropdowns for filter fields
   (only the old `browseEntry.ts` version did; the current `subjectObjectBrowse.ts` does not). The
   `dropdownNames` discovery should be re-added to `createModelHandlers.ts` and passed to
   `subjectObjectBrowse`.

4. **Custom browse columns configuration** — The `IBrowserConfig.columns` property exists in types
   but is not used by `subjectObjectBrowse`. It should override the default column list from
   `model.cards.browse.widgets`.

5. **`browser.filter`** — The default browse filter (`IBrowserConfig.filter`) is defined in types
   but not passed to the Explorer `listAction`.

6. **`browser.create` array** — Multiple create types (e.g. "New Coral" vs "New Soft Coral") are
   typed but not rendered in the browse toolbar.

7. **`methods.remove`** — The remove method is defined in types/defaults but no delete page or
   confirmation dialog is generated.

8. **Server customizations integration** — The `x-ui-customizations` from the OpenAPI document is
   extracted by `schemaFetcher` but not yet merged into the cards/layouts on the model pages.

9. **Storybook stories for model pages** — No Storybook stories exist that use `setupModelMock` +
   `createModelHandlers` to render the generated pages. These are needed for visual verification and
   regression testing.

---

## Testing

Unit tests live alongside the source files:

```bash
# Run model tests
cd core/blong-ui && npx vitest run src/model
```

Use `setupModelMock` in test `beforeEach` and `teardownModelMock` in `afterEach` to ensure clean
state between tests. The test files use `vi.fn()` and `vi.spyOn()` for mock assertions.
