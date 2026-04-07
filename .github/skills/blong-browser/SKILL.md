---
name: blong-browser
description: >
    Implement, extend, or debug the blong-browser React/TypeScript component library and portal
    framework. blong-browser is a Blong realm that lives in `core/blong-browser/`. Use this skill whenever
    working on UI components, Editor/Form/Explorer/Report pages, widgets, portal navigation,
    schema-driven forms, action wiring, Storybook stories, or any blong-browser adapter/orchestrator code
    — even if the user just says "add a page", "fix the widget", or "show this in a tab". For
    developing or improving the model system itself, use the blong-browser-model-dev skill. For using the
    model to implement CRUD pages in a realm, use the blong-browser-model skill.
---

# blong-browser Skill

## What is blong-browser?

`@feasibleone/blong-browser` (`core/blong-browser/`) is a schema-driven React UI framework and portal shell.
It supersedes `ut-prime` and `ut-model`, preserving their proven UX patterns while adopting a
cleaner architecture aligned with the Blong framework. The primary domain example used in stories
and mocks is **marine biology** (corals, fish, etc.) — not the `ut-prime` tree metaphor.

**Key goals:**

- Schema-driven forms: derive widgets, validation, and labels automatically from OpenAPI JSON Schema
- Micro-frontend: realms contribute components/actions without direct cross-realm imports
- Three widget categories: scalar, scalar-array (multi-select), vector-array (tables)
- Blong-native: uses adapters/orchestrators, not Redux; uses Zustand for global state

---

## Package structure

```
core/blong-browser/
  browser.ts              ← realm entry point (import in suite's browser.ts)
  adapter/
    backend.ts            ← HTTP JSON-RPC adapter (namespace: backend)
    storage.ts            ← Dispatch-based browser storage adapter (namespace: storage)
  orchestrator/
    portal.ts             ← Portal orchestrator (namespace: portal)
    auth.ts               ← Auth orchestrator (namespace: auth)
    portal/               ← Individual portal handlers (semantic triple naming)
      portalReady.ts
      portalTabShow.ts
      portalTabClose.ts
      portalMenuItem.ts
      portalParamsGet.ts
      portalDropdownList.ts
    auth/
      authLogin.ts
      authLogout.ts
      authSessionGet.ts
  src/
    components/           ← React UI components
    context/              ← BlongUiContext (dispatch, schema, TanStack Query)
    hooks/                ← useAction, usePortal, useLayout, useAuth, etc.
    schema/               ← SchemaRegistry (fetches + enriches OpenAPI spec)
    state/                ← appStore (Zustand — auth, tabs, toasts, loader)
    types/                ← TypeScript types (widget.ts, action.ts, portal.ts, …)
    widgets/              ← Widget registry + individual widget components
    design/               ← Design mode components (PropertyEditor, DropZone, etc.)
    styles/               ← CSS overrides and theme variables
```

---

## How blong-browser wires into the platform

### Realm entry (`browser.ts`)

The realm wires two sub-layers (adapter + orchestrator):

```ts
export default realm(blong => ({
    url: import.meta.url,
    children: ['./adapter', './orchestrator'],
    config: {default: {adapter: true, orchestrator: true}},
}));
```

Include in a suite's `browser.ts` as a child realm:

```ts
async function blongUi() {
    return import('@feasibleone/blong-browser/browser.js');
}
```

### `portalReady` — mounting React into the DOM

`portalReady` is called by blong-gogo once the browser registry is ready. It receives a `proxy`
(handler proxy object) and mounts `<App dispatch={dispatch}>` into the DOM:

```ts
export default handler(
    ({handler: proxy}) =>
        async function portalReady(params) {
            const [{default: React}, {default: ReactDOM}, {App}] = await Promise.all([
                import('react'),
                import('react-dom/client'),
                import('../../src/components/App/index.js'),
            ]);
            const dispatch = (method, rpcParams = {}) => (proxy as any)[method](rpcParams);
            ReactDOM.createRoot(rootEl).render(React.createElement(App, {dispatch, ...params}));
            return true;
        },
);
```

`dispatch` is the critical bridge: calling `dispatch('marine.coral.fetch', {...})` routes through
the browser handler registry (orchestrators → adapters → HTTP).

### `App` component

`App` wraps everything in `BlongUiProvider` + `Theme`, then renders the `Portal` shell:

```
App
  └── BlongUiProvider  (dispatch, schemaRegistry, TanStack QueryClient)
        └── Theme
              ├── Portal  (Menubar + TabView of open pages)
              └── ErrorDialog
```

For Storybook / testing, pass `children` instead of portal props to skip the shell.

---

## Action system

Actions are the primary abstraction for all user interactions. Three types:

| Type         | When to use                           | Key fields                                             |
| ------------ | ------------------------------------- | ------------------------------------------------------ |
| **page**     | Open a React component in a new tab   | `component: () => import(...)`, `title`                |
| **query**    | Fetch data (cached by TanStack Query) | `method: 'subject.object.fetch'`                       |
| **mutation** | Save/delete data, invalidate caches   | `method: '...'`, `mutates: true`, `invalidates: [...]` |

Actions are registered in `appStore` via `registerActions()`. Realms export an `actions` object.

### `useAction` hook

The primary hook for calling actions inside components:

```ts
const loader = useAction<MyData[]>('marine.coral.fetch', {reefId: 42});
// loader.data, loader.loading, loader.error
await loader.call({reefId: 99}); // for mutation actions
```

Page actions open a new tab in the portal. Query actions use TanStack Query internally.

---

## Form / Editor architecture

All data editing flows through: **Editor → Form → Card → Widget**

### Widget categories

1. **Scalar** — single primitive value: `input`, `mask`, `text`, `textArea`, `password`, `number`,
   `integer`, `currency`, `percent`, `boolean`, `checkbox`, `switch`, `date`, `time`, `dateTime`,
   `dateRange`, `dropdown`, `select`, `file`, `image`, `json`, `code`, `divider`, `label`, `link`

2. **Scalar-array** — array of primitive values: `multiSelect`, `multiSelectTree`,
   `multiSelectPanel`, `multiSelectTreeTable`, `chips`, `selectTable`

3. **Vector-array** — array of objects: `table` (the main editable table widget)

The Form owns all data via `react-hook-form`. Widgets are _read/write views_ into that data — they
don't own state. The Form publishes changes via `onChange` and submits via `onSubmit`. **Always wrap
the `<form>` in `handleSubmit(...)` even when no `onSubmit` prop is provided**, otherwise pressing
Enter or clicking a submit button causes browser navigation.

### Editor load/save lifecycle

The Editor orchestrates load and save via action names:

| Prop         | Purpose                                                                        |
| ------------ | ------------------------------------------------------------------------------ |
| `loadAction` | Action name whose result populates the form (skipped when `value` is provided) |
| `loadParams` | Static params passed to the load action                                        |
| `saveAction` | Action name called with the form data on submit                                |
| `onSave`     | Callback receiving the saved value on success (e.g. show a toast)              |
| `value`      | Static initial value — bypasses `loadAction` entirely                          |

**Loading state:** While `loadAction` is pending, each field renders a `<Skeleton>` placeholder
instead of the widget (per-field skeleton, same width as the real input).

**Load error:** If `loadAction` rejects, the Editor shows an error state. Use an action that rejects
to test this path in Storybook.

### Validation

**Client-side:** Fields marked `required: true` in the schema are validated on submit. Errors show
inline beneath the field. A toast summarises the count of invalid fields.

```ts
properties: {
    name: { title: 'Name', required: true },   // validated on save
}
```

**Server-side:** When `saveAction` rejects with `{validation: [{field, message}]}`, each error is
pushed into react-hook-form and displayed inline by field name. An `error.print` message is shown as
a popup anchored to the Save button.

**Dropdown/load errors:** Use an error-suffixed action name or static dropdown key to test error
states. The widget enters an error visual state.

### Editor toolbar

The Editor auto-builds a toolbar from its `editable`/`editMode` state:

- In **read mode** with `editable: true`: shows Edit (pencil) button
- In **edit mode**: shows Save (disk/check) and Reset (replay) buttons; both disabled when form is
  untouched (`!isDirty`)
- `toolbar` prop adds extra buttons on the left
- `toolbarRight` prop adds buttons on the right

```ts
toolbarRight={[{label: 'Export', icon: 'pi pi-download', action: 'marine.coral.export'}]}
```

`editable` = user can toggle between read and edit mode. `editMode` = initial mode (true = starts in
edit mode). Use `editable={true} editMode={true}` for forms that are always editable.

### Design mode

`designable={true}` adds a cog button to the toolbar right. Clicking it activates design mode where
cards can be drag-dropped to rearrange the layout. The updated `FlatLayoutConfig` is communicated
back via `onLayoutChange`. Design mode is a `DesignModeContext`-based feature that wraps the form in
a `DndContext` for drag-and-drop.

### Schema-driven widget resolution

Widget type is auto-resolved from JSON Schema `format` and `type`:

- `format: 'date'` → DateWidget
- `format: 'date-time'` → DateTimeWidget
- `type: 'boolean'` → BooleanWidget
- `type: 'integer'` → IntegerWidget
- `widget.type` always takes precedence when explicitly set

### Layout system

The layout determines how cards are arranged in a grid.

**Flat layout** — `FlatLayoutConfig = (string | string[])[]`:

- `'cardName'` → own column
- `['cardA', 'cardB']` → stacked cards (same column)

```ts
layouts={{ edit: ['master', ['detail', 'extra']] }}
// master = own column; detail+extra = stacked in second column
```

**Tab layout** — `{items: [{id, label, icon?, widgets: [...cardNames]}]}`

```ts
layouts={{ edit: { items: [
    { id: 'tab1', label: 'Basic Info', icon: 'pi pi-user', widgets: ['personal', 'contact'] },
    { id: 'tab2', label: 'Documents', icon: 'pi pi-file', widgets: ['documents'] },
]}}}
```

`icon` uses PrimeIcons format: `'pi pi-user'`.

**Steps layout** — same as tab but with `type: 'steps'`; renders ← [indicator] → nav bar. The
forward → button is `type="submit"` on the last step, triggering form submission.

**Left/right sidebar layout** — `orientation: 'left'` or `'right'` renders a `PanelMenu` vertical
accordion nav instead of a `TabMenu`. Used for thumb-index style navigation.

```ts
layouts={{ edit: { orientation: 'left', items: [
    { id: 'group-a', label: 'Group A', icon: 'pi pi-id-card', widgets: ['card1', 'card2'] },
    { id: 'group-b', label: 'Group B', icon: 'pi pi-cog', widgets: ['card3'] },
]}}}
```

**Component injection in tabs** — a tab item can specify `component` to render a full React
component (e.g. an `Explorer`) instead of a list of cards:

```ts
{ id: 'history', label: 'History', component: HistoryExplorer }
// HistoryExplorer is a React component receiving no props from the form
```

**PrimeFlex breakpoints**: use `md:col-4` (768px) for desktop-visible column classes. `xl:col-4`
requires ≥1200px viewport — too large for the Storybook iframe.

### Card configuration

Each card entry in `cards` has:

- `label` — card title
- `widgets` or `fields` — list of field names to render
- `className` — PrimeFlex grid class (e.g. `'col-12 md:col-4'`)
- `watch` — makes a reaktive detail card (see Master-Detail below)
- `permission` — hide card if `checkPermission(key)` returns false
- `hidden` — render as hidden inputs only
- `collapsible` — adds collapse toggle to card header

### Polymorphic cards (`card.match`)

When multiple detail cards are defined for the same `watch` field, each can include a `match`
condition. Only the card whose `match` values all equal the corresponding fields of the selected row
is rendered:

```ts
cards: {
    circleDetail:    { watch: 'shape', match: {type: 'circle'},    widgets: ['radius'] },
    rectangleDetail: { watch: 'shape', match: {type: 'rectangle'}, widgets: ['width', 'height'] },
    triangleDetail:  { watch: 'shape', match: {type: 'triangle'},  widgets: ['base', 'height'] },
}
```

Only the matching detail card is shown; the others are invisible. When no row is selected all
polymorphic detail cards are hidden.

### Master-Detail pattern

A detail card with `watch: '$.selected.person'` renders editable fields from the currently selected
row of the `person` table widget.

Widget names in the detail card use the `$.edit.person.fieldName` path convention:

```ts
cards: {
    master: { widgets: ['person'] },
    detail: {
        watch: '$.selected.person',
        widgets: ['$.edit.person.fullName', '$.edit.person.birthDate'],
    },
}
```

The Form reads `itemsProps[fieldName]` from `schema.properties.person.items.properties` for
field-level schemas, bypassing the top-level `schemaProps` filter.

### Cascaded dropdowns / tables

Wire parent/child via `widget.parent` and `widget.master`:

```ts
widget: {
    type: 'table',
    parent: '$.selected.person',    // or just 'person'
    master: { personId: 'personId' }, // {ownKey: parentKey}
    autoSelect: true,               // auto-select first matching row
}
```

`parent` supports dot-path notation: `'$.selected.person'` extracts `person`.

### Table widget options

- `selectionMode: 'single' | 'multiple'` — row selection; single uses CSS outline (no radio column)
- `actions.allowEdit: false` — suppress row-edit pencil buttons
- `actions.allowAdd / allowDelete / allowSelect` — show/hide toolbar actions
- `label` — title shown in the table toolbar (separate from the card's `label`; omit card label when
  using this)
- `columns: string[]` — explicit column order (falls back to `items.properties` keys)
- `hidden: string[]` — fields used as keys but not shown as columns
- `pivot` — pivot table from dropdown options or static examples
- `inlineEdit: true` — edit boolean/dropdown values directly in the cell without a row-edit dialog

### Custom widget registration

Third-party or realm-specific widgets are added to the registry at application start:

```ts
import {widgetRegistry} from '@feasibleone/blong-browser';
widgetRegistry.register('myRating', MyRatingComponent);
```

Then reference them in schema: `widget: {type: 'myRating'}`. The built-in widgets are registered by
calling `registerBuiltinWidgets()` during app bootstrap.

---

## Portal and navigation

The Portal shell (`src/components/Portal/`) renders:

- `Menubar` at the top (wired from `IPortalConfig.menu`)
- `TabView` of open pages (each tab is an `ITab` from `appStore`)

Navigation uses the **action system** — clicking a menu item calls `openTab({actionName, ...})`. The
`portal.tab.show` handler loads the component (lazy import) and pushes it into
`appStore.portal.tabs`.

`IPortalConfig` (YAML/JSON):

```ts
{ name, title, home, menu: [{title, action, icon, items?}] }
```

---

## Adapters and orchestrators

### `adapter/backend.ts` — HTTP JSON-RPC

Extends `adapter.http` with `codec.jsonrpc` + `codec.mle`. All back-end calls from the browser go
through this adapter under the `backend` namespace.

### `adapter/storage.ts` — Browser storage

Extends `adapter.dispatch` for local browser storage operations (namespace: `storage`).

### `orchestrator/portal.ts`

Extends `orchestrator.dispatch` for `portal.*` methods. Imports handlers matching `/\.component$/`,
`/\.portal$/`, `/\.actions?$/`, plus `ui.portal`. Realms contribute components and actions by
registering handlers in files ending with `.component`, `.portal`, or `.actions`.

### `orchestrator/auth.ts`

Extends `orchestrator.dispatch` for `auth.*` methods (`authLogin`, `authLogout`, `authSessionGet`).

---

## Global state (Zustand `appStore`)

`useAppStore` is the single Zustand store. Key slices:

| Slice                | Purpose                                     |
| -------------------- | ------------------------------------------- |
| `auth`               | JWT token, user profile, permissions        |
| `portal.tabs`        | Open page tabs                              |
| `portal.activeTabId` | Currently active tab                        |
| `portal.menuConfig`  | Loaded portal menu config                   |
| `toasts`             | Toast notifications queue                   |
| `loader`             | Global loading overlay                      |
| `actions`            | Registered `ActionRegistry`                 |
| `error`              | Last unhandled error (shown in ErrorDialog) |

---

## Event bus

`blongEvents` is a singleton typed event bus (exported from `@feasibleone/blong-browser`). It uses the
native browser `EventTarget` API — zero dependencies, works in any environment.

Events are emitted automatically by `BlongUiContext`'s `wrappedDispatch`:

| Event            | Payload                    | When fired                     |
| ---------------- | -------------------------- | ------------------------------ |
| `action:before`  | `{method, params}`         | Before every dispatch call     |
| `action:success` | `{method, params, result}` | After a dispatch call resolves |
| `action:error`   | `{method, params, error}`  | After a dispatch call rejects  |

**Subscribing:**

```ts
import {blongEvents} from '@feasibleone/blong-browser';

// Subscribe — returns an unsubscribe function
const off = blongEvents.on('action:success', ({method, result}) => {
    console.log('[blong]', method, result);
});

// Unsubscribe
off();
```

**In React (useEffect):**

```ts
useEffect(() => {
    return blongEvents.on('action:success', ({method, result}) => {
        // show toast, update analytics, etc.
    });
}, []);
```

The Storybook `withDispatch` decorator uses `blongEvents.on('action:success', ...)` to show the
configurable success toast — making it independent of the dispatch mock implementation.

---

## Schema registry

`schemaRegistry` fetches `/openapi.json` on first use and caches enriched schemas per component
name. `useBlongUi().schemaRegistry.resolve('ModelName')` returns an `IEnrichedSchema`.

Widget config (`x-widget`) is normalized from the OpenAPI extension into `IWidgetConfig` at
enrichment time. Field schemas drive: widget type resolution, validation rules, label display,
required marker, and layout inference.

---

## Component summary

| Component      | Purpose                                                         |
| -------------- | --------------------------------------------------------------- |
| `App`          | Top-level composition root; wraps provider + theme + portal     |
| `Portal`       | Menubar + TabView shell; opens actions as tabs                  |
| `Editor`       | Form + toolbar + load/save lifecycle; schema-driven page editor |
| `Form`         | react-hook-form wrapper; Card grid; owns all form state         |
| `Explorer`     | DataTable list view + toolbar + optional tree navigator         |
| `Report`       | Filter form + metrics summary cards + read-only DataTable       |
| `Card`         | Labelled container for a group of widgets                       |
| `Deck`         | PrimeFlex grid column; stacks one or more cards                 |
| `ActionButton` | Button wired to an action name via dispatch                     |
| `Navigator`    | Tree navigator panel for hierarchical browsing                  |
| `ThumbIndex`   | Tabbed index navigation (letter or custom groups)               |
| `Page`         | Simple page wrapper with title and breadcrumb                   |
| `Permission`   | Render children only if `checkPermission(key)` passes           |
| `Login`        | Login form; calls `auth.login` action on submit                 |
| `Theme`        | PrimeReact theme loader (CSS-variable based, lara family)       |

---

## Storybook

Stories live in `src/components/*/` as `*.stories.tsx`. The tree schema from
`src/components/Editor/fixtures/tree.ts` is the canonical complex form example. Import `StoryFn`
type from `Editor.stories.tsx` when creating sub-story files.

The `.storybook/dispatch.js` provides a mock dispatch that mirrors the blong action registry
contract. Use it in Storybook decorators or wrap `withDispatch(mockDispatch)` for isolated stories.

**Template / reuse pattern:** Export a base story with `.args` set, then re-export it with
`.bind({})` for variant sub-stories — mirrors the ut-prime pattern for avoiding JSX duplication.

**Toast notifications:** The global `withDispatch` decorator subscribes to `blongEvents` and shows a
success toast after any handler that looks like a mutation completes (default filter: exclude
`portal.dropdown.list` and methods ending with `Get/Load/Find/List/Fetch`). The toast displays the
method name and the JSON result. Control per story via `decorators`:

```ts
// Show toasts for specific methods only
MyStory.decorators = [withDispatch({}, {notify: ['marine.coral.add', 'marine.coral.edit']})];
// Suppress all toasts for a story
MyStory.decorators = [withDispatch({}, {notify: false})];
// Show toasts for ALL methods (including reads)
MyStory.decorators = [withDispatch({}, {notify: true})];
```

`NotifyConfig = boolean | string[] | ((method: string) => boolean)` — the predicate form lets you
write any matching logic.

The toasts come from `blongEvents` (see Event bus section) — not from `onSave` or the dispatch mock
directly. This means any code that subscribes to `blongEvents.on('action:success', ...)` gets the
same notifications.

**`play()` functions:** Use `within(canvasElement)` + `@testing-library/user-event` to simulate
interactions. All Storybook stories with `play()` are run as Storybook interaction tests:

```ts
MyStory.play = async ({canvasElement}) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText('Row label'));
    await new Promise(r => setTimeout(r, 200)); // wait for reactive updates
};
```

**Important**: `<Form>` must always have a real `onSubmit` handler attached (via `handleSubmit` even
when no `onSubmit` prop is provided) — otherwise the browser will navigate on form submit.

## Planned / stub features (not yet implemented)

These appear as story stubs but the framework wiring is not yet in place:

- **`onFieldChange`** — handler called when a specific field changes, enabling computed/derived
  fields and conditional visibility. Pattern planned: `onFieldChange: 'handlerName'` on the Editor,
  resolved as a backend method name.
- **`typeField`** — prop on Editor that auto-switches the active tab when a discriminator field
  changes value (e.g. type changes from `'circle'` to `'square'` → switches to the matching tab).
- **Steps `disableBack` / `hideBack`** — props to suppress the back navigation button in steps
  layout.

Do not implement these yet without checking if they have been added to the codebase first.

---

## Extending blong-browser in a realm

A realm that contributes UI pages registers:

1. A handler file ending in `.component` (e.g. `marine.coral.browse.component.ts`) that returns
   `{title, permission, component: () => import('...') }` — this makes the component discoverable by
   the portal orchestrator.
2. An actions file ending in `.actions` that exports named `IAction` records.
3. A portal config file ending in `.portal` that defines menu structure referencing those actions.

The portal orchestrator imports all matching handlers automatically without direct realm coupling.

## Debugging tips

Check for any shared browser tabs, where the one using localhost:6006 is the blong-browser Storybook and
another one hosted on chromatic.com. Use them to verify blong-browser is working as expected (e.g. the
expected is on chromatic.com). Open the iframes to avoid the Storybook UI getting in the way.

---

## Related skills and documentation

- **blong-browser-model-dev** — Use when developing or improving `src/model/` internals
  (createModelHandlers, entry files, schemaFetcher, dropdownRegistry, types, defaults, mock).
- **blong-browser-model** — Use when a realm needs to define `IModelSpec` objects and use
  `createModelHandlers` to generate CRUD pages.

Documentation:

- [Browser UI concept](../../docs/blong/docs/concepts/browser-ui.md)
- [blong-browser Model concept](../../docs/blong/docs/concepts/blong-browser-model.md)
- [Editor Features](../../docs/blong/docs/concepts/editor-features.md)
- [blong-browser Pattern](../../docs/blong/docs/patterns/blong-browser.md)
- [blong-browser Model Pattern](../../docs/blong/docs/patterns/blong-browser-model.md)
- [Metadata-Driven UI rationale](../../docs/blong/docs/rationale/metadata-driven-ui.md)
