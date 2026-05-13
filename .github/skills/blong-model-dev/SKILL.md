---
name: blong-model-dev
description: >
    Develop, extend, debug, or improve the blong-browser model system internals. The model system
    lives in `core/blong-browser/src/model/` and provides the `subjectObjectComponent` aggregator
    that auto-generates Browse/New/Open/Report pages from IModelSpec declarations. Use this skill
    when working on the model system itself: subjectObjectComponent, entry files
    (subjectObjectBrowse/New/Open/Report in component/), IModelSpec types, withDefaults,
    dropdownRegistry, or the mock system (adapter/mock.ts + subjectObjectMock.ts). For using the
    model to build realm pages, use the blong-model skill instead.
---

# blong-model-dev Skill

## What this skill covers

The model system (`core/blong-browser/src/model/`) is the highest-level abstraction in
blong-browser. It generates complete CRUD pages from declarative `IModelSpec` objects. This skill is
for **developing and improving the model system itself**.

For describing what the model is conceptually, see:

- [blong-browser Model concept](../../docs/blong/docs/concepts/blong-model.md)

For using the model in realm development, use the **blong-model** skill.

---

## File Map

```
core/blong-browser/src/model/
  defaults.ts             ← withDefaults() + deepMerge() — fills in standard values for partial specs
  dropdownRegistry.ts     ← On-demand dropdown load + deduplication + cache
  index.ts                ← Public re-exports
  defaults.test.ts        ← Unit tests for withDefaults
  Model.tsx               ← <Model> React component for Storybook / standalone usage
  component/
    subjectObjectComponent.ts  ← Aggregator — called by portal.ts to build the components map
    subjectObjectBrowse.ts     ← Browse page factory (uses Editor in browse layout)
    subjectObjectNew.ts        ← New (create) page factory
    subjectObjectOpen.ts       ← Open (edit) page factory
    subjectObjectReport.tsx    ← Report page factory (optional)
  mock/
    subjectObjectMock.ts  ← Mock handler generator — used by adapter/mock.ts

core/blong-browser/
  adapter/mock.ts         ← Mock adapter — discovers .model and .fixture handlers, builds mocks
  orchestrator/portal.ts  ← Portal orchestrator — discovers .model handlers, builds components map
```

Types for IModelSpec, IResolvedModelSpec, IBrowserConfig, etc. live in `@feasibleone/blong` (the
core types package), not in blong-browser itself.

---

## Key Types (in `@feasibleone/blong`)

```typescript
/** The input spec provided by realm developers */
interface IModelSpec {
    subject: string; // namespace, e.g. 'marine'
    object: string; // entity, e.g. 'coral'
    objectTitle?: string; // defaults to capital(object)
    keyField?: string; // defaults to '${object}Id'
    nameField?: string; // defaults to '${object}.${object}Name'
    schema?: ISchemaOverlay;
    cards?: Record<string, ICardConfig>;
    layouts?: Record<string, LayoutConfig>;
    browser?: IBrowserConfig;
    editor?: IEditorConfig;
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
    editor: Required<IEditorConfig>;
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
| `browser.title`        | `'${objectTitle} List'`                           |
| `browser.icon`         | `'pi pi-list'`                                    |
| `browser.permission.*` | `'${subject}.${object}.{browse/add/edit/delete}'` |

The `deepMerge()` helper in `defaults.ts` deeply merges plain objects, overwriting arrays and
primitives. It is also exported for use elsewhere in the model system.

---

## Schema retrieval in entry factories

There is **no standalone `schemaFetcher.ts`**. Instead, each entry factory (Browse/New/Open/Report)
calls the `{subject}.{object}.schema` handler at runtime to retrieve the browser-side schema
override:

```typescript
const [schemaOverride, {Editor}] = await Promise.all([
    blong.handler[`${subject}.${object}.schema`]<IEnrichedSchema>({}, {}),
    import('../../components/Editor/Editor.js'),
]);
const schema = blong.lib.merge({}, model.schema, schemaOverride);
```

- `{subject}.{object}.schema` is a backend handler that returns runtime schema customisations (e.g.
  tenant-specific design overrides stored in the database). It returns `{}` when there are no
  overrides.
- `model.schema` is the static browser-side overlay defined in the `IModelSpec`.
- `blong.lib.merge` deep-merges them: `model.schema` first (static defaults), then `schemaOverride`
  (runtime, highest priority).
- The merged object is an `IEnrichedSchema` passed directly to `Editor` or `Report`.

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
    // Clear all caches (used in test teardown to reset between tests)
    clear(): void;
}
export const dropdownRegistry: DropdownRegistry;
```

The loader convention: `dropdownRegistry.get('marine.family', loader)` where `loader(name)` calls
`{subject}.dropdown.list({name})` on the backend. The `subject` is extracted as the first segment of
the dropdown name (`'marine.family'` → subject `'marine'`).

---

## Entry files (`component/`)

Each entry file exports an **async factory function** that takes a resolved model and the
`IHandlerProxy` (`blong`) from the orchestrator context, and returns an async function that produces
the `{title, permission, icon, component}` page descriptor.

### Signature pattern

```typescript
export async function subjectObjectBrowse(
    model: IResolvedModelSpec,
    blong: IHandlerProxy<unknown>,
): Promise<
    () => Promise<{
        title: string;
        permission: string;
        icon: string;
        component: () => Promise<React.ComponentType>;
    }>
>;
```

### Current implementations

**`subjectObjectBrowse`** — `Editor` in `layout: 'browse'` mode:

- Schema fetched via `blong.handler['{subject}.{object}.schema']`, merged with `model.schema`
- `editable: false, editMode: false, layout: 'browse'`
- `toolbar` prepends a `{icon: 'pi pi-refresh', action: '__refresh__', title: 'Refresh'}` button
  before `model.browser.toolbar` — clicking it invalidates all TanStack Query caches whose
  key starts with `{subject}.{object}.` (forces the browse table to refetch)
- `refreshNamespace: '{subject}.{object}'` is passed to `Editor` to wire up the `__refresh__` handler
- `cards` and `layouts` from model (default `browse` layout has 3-panel split with navigator)

**`subjectObjectNew`** — `Editor` with:

- Schema fetched via `blong.handler['{subject}.{object}.schema']`
- **`createAction`** from `model.methods.add` (called only on the first save — creates the record)
- **`saveAction`** from `model.methods.edit` (called on subsequent saves after mode switches to `'edit'`)
- `mode: 'new'` — after the first save the Editor automatically switches to `'edit'` mode so the
  second save calls `saveAction` (`.edit`), not `createAction` (`.add`). This prevents duplicate
  records when the user saves, edits a field, and saves again.
- `title: {new: 'Create {objectTitle}', edit: 'Edit {objectTitle}'}` — a plain `Record<string,string>`
  (JSON-serializable, translation-friendly) so the tab title updates when mode switches
- **Important:** the `title` object is hoisted **outside** the `NewPage` render function to keep
  its reference stable. An inline object literal would trigger the tab-title `useEffect` on every
  render, causing an infinite update loop (`Maximum update depth exceeded`).
- `editable: false, value: {}` — always in edit mode, no view/edit toggle

**`subjectObjectOpen`** — `Editor` with:

- Schema fetched via `blong.handler['{subject}.{object}.schema']`
- `loadAction` from `model.methods.get`; `loadParams = {[keyField]: params[keyField]}`
- `saveAction` from `model.methods.edit`
- `title: 'Edit {objectTitle}'` — static string (already in edit mode, no mode switch needed)
- `editable: true` (shows Edit/Save/Reset toolbar)

**`subjectObjectReport`** — `Report` with:

- Schema fetched via `blong.handler['{subject}.{object}.schema']`
- `dataAction` from `model.methods.report`
- `filterSchema` from merged schema
- Only registered when `model.report?.permission` is truthy

---

## `component/subjectObjectComponent.ts`

The aggregator that the portal orchestrator calls for each batch of `.model` handlers:

```typescript
export default async (models: IModelSpec[], blong: IHandlerProxy<unknown>) => {
    const components: Record<string, () => Promise<IComponent>> = {};
    for (const rawModel of models) {
        const model = withDefaults(rawModel);
        const {subject, object} = model;
        components[`${subject}.${object}.browse`] = await subjectObjectBrowse(model, blong);
        components[`${subject}.${object}.new`] = await subjectObjectNew(model, blong);
        components[`${subject}.${object}.open`] = await subjectObjectOpen(model, blong);
        if (model.report?.permission)
            components[`${subject}.${object}.report`] = await subjectObjectReport(model, blong);
    }
    return components;
};
```

This is called from `orchestrator/portal.ts` inside `createHandlers` when `kind === 'model'`.

---

## `adapter/mock.ts` and `mock/subjectObjectMock.ts`

The mock adapter (`adapter/mock.ts`) activates in `storybook` and `integration` environments. It:

1. Imports all handlers matching `/\.model$/` and `/\.fixture$/` from realm browser layers
2. Calls `subjectObjectMock(models, blong)` for each batch of `.model` handlers to generate mock API
   handlers
3. Fixture data is loaded by calling `blong.handler['{subject}Fixture']({}, {})` — a handler
   exported from a `{subject}Fixture.ts` file using the `fixture()` factory

`subjectObjectMock.ts` generates the following mock handlers per model:

- `{subject}.{object}.schema` — returns `{}` (no server-side overrides)
- `{subject}.{object}.find` — filters/sorts/pages fixture items in memory
- `{subject}.{object}.get` — returns single item by `keyField`
- `{subject}.{object}.add` — appends item; generates auto-increment `keyField`
- `{subject}.{object}.edit` — updates matching item in memory
- `{subject}.{object}.remove` — removes matching item in memory
- `{subject}.{object}.report` — returns all fixture rows
- `{subject}.dropdown.list` — synthesises `{value, label}` pairs from fixture data

Fixture handlers (`{subject}Fixture`) use the `fixture()` factory from `@feasibleone/blong` and
return a YAML-parsed object keyed by entity name (e.g.
`{'marine.coral': [...], 'marine.family': [...]}`).

---

## Known Unfinished / Improvement Opportunities

The following are areas where the model system has known gaps:

1. **Browse "Open" on row click** — The `subjectObjectBrowse` generates an Editor with a table
   widget, but opening `{subject}.{object}.open` on row click depends on the table widget's `action`
   field on `nameField` being wired correctly. Verify this via the coral browse story.

2. **Custom browse columns configuration** — The `IBrowserConfig.columns` property exists in types
   but the default browse layout uses `model.cards.browse.widgets` to derive columns.

3. **`browser.filter`** — The default browse filter (`IBrowserConfig.filter`) is defined in defaults
   but its interaction with the Editor browse layout needs verification.

4. **Server customizations** — The `{subject}.{object}.schema` handler can return design-time
   customisations, but the merging priority (model.schema → schemaOverride) should be confirmed
   before adding new override keys.

5. **Storybook stories for model pages in ui-demo** — The model pages are exercised via the
   `core/ui-demo/.storybook/` setup (using `withBlong(browser)` + the full blong platform loaded),
   not via `blong-browser/.storybook/` per-component stories.

---

## Common Pitfalls

### Duplicate records on second save from New page

If `subjectObjectNew` uses `saveAction: methods.add` for both create and edit, clicking Save after
the first save calls `.add` again — creating a duplicate. The correct pattern is:

```typescript
// CORRECT — createAction for first save, saveAction for subsequent saves
Editor({
    createAction: methods.add,   // ← called once, in 'new' mode
    saveAction: methods.edit,    // ← called after mode switches to 'edit'
    mode: 'new',
    ...
})
```

The Editor automatically switches from `mode='new'` to `mode='edit'` after the first successful
save, so `createAction` is called exactly once.

### Infinite update loop from inline title object

Passing `title` as an inline object literal inside a React render function creates a new object
identity on every render. The Editor's tab-title `useEffect` reads `titleProp` via a ref to avoid
this, but the object should still be hoisted outside the render function as good practice:

```typescript
// WRONG — inline object triggers effect on every render (may still cause loop in some setups)
function NewPage(props) {
    return Editor({title: {new: 'Create X', edit: 'Edit X'}, ...props});
}

// CORRECT — stable reference, hoisted outside the render function
const title = {new: `Create ${objectTitle}`, edit: `Edit ${objectTitle}`};
function NewPage(props) {
    return Editor({title, ...props});
}
```

### `__refresh__` button tooltip error

Internal action names starting with `__` (e.g. `__refresh__`, `__edit__`, `__save__`) are handled
directly in the Editor's toolbar render loop — they are **not** dispatched as RPC methods. If a
new `__xxx__` button falls through to `ActionButton`, it will fail with a "Method binding failed"
error. Always add new internal actions to the `if (actionName === '__edit__' || ...)` branch in
`Editor.tsx` and handle them in `handleToolbarAction`.

---

## Testing

Unit tests live alongside the source files:

```bash
# Run model tests
cd core/blong-browser && npx vitest run src/model
```

The `defaults.test.ts` file tests `withDefaults()` using plain spec objects. Tests use `vi.fn()` and
`vi.spyOn()` for mock assertions. When testing entry factories, pass a mock `blong.handler` proxy
that resolves `{subject}.{object}.schema` calls with `{}`.
