---
name: blong-browser
description: >
    Implement, extend, or debug the blong-browser React/TypeScript component library and portal
    framework. blong-browser is a Blong realm that lives in `core/blong-browser/`. Use this skill
    whenever working on UI components, Editor/Form/Explorer/Report pages, widgets, portal
    navigation, schema-driven forms, action wiring, Storybook stories, or any blong-browser
    adapter/orchestrator code — even if the user just says "add a page", "fix the widget", or "show
    this in a tab". For multi-language support, translations, or i18n, use the blong-i18n skill. For
    developing or improving the model system itself, use the blong-browser-model-dev skill. For
    using the model to implement CRUD pages in a realm, use the blong-browser-model skill.
---

# blong-browser Skill

## What is blong-browser?

`@feasibleone/blong-browser` (`core/blong-browser/`) is a schema-driven React UI framework and
portal shell. It supersedes `ut-prime` and `ut-model`, preserving their proven UX patterns while
adopting a cleaner architecture aligned with the Blong framework. The primary domain example used in
stories and mocks is **marine biology** (corals, fish, etc.) — not the `ut-prime` tree metaphor.

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
  storybook.tsx           ← withBlong(browser) decorator for model page Storybooks
  adapter/
    backend.ts            ← HTTP JSON-RPC adapter (namespace: backend)
    mock.ts               ← Auto-generated CRUD mock adapter (namespace: backend; storybook/integration only)
    storage.ts            ← Dispatch-based browser storage adapter (namespace: storage)
  orchestrator/
    portal.ts             ← Portal orchestrator (namespace: portal/component/action)
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
    context/              ← BlongContext (handlerProxy, useBlong, BlongProvider, makeHandlerProxy)
    hooks/                ← useAction, usePortal, useLayout, useAuth, etc.
    schema/               ← SchemaRegistry (fetches + enriches OpenAPI spec)
    state/                ← appStore (Zustand — auth, tabs, toasts, loader)
    types/                ← TypeScript types (widget.ts, action.ts, portal.ts, …)
    widgets/              ← Widget registry + individual widget components
    design/               ← Design mode components (PropertyEditor, DropZone, etc.)
    model/                ← Model system (subjectObjectComponent, entry factories, mock, dropdownRegistry)
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

### `ready` handler — mounting React into the DOM

`portalReady` is called by blong-gogo once the browser registry is ready. The full handler proxy
(`blong`) is passed to `<App handlerProxy={blong}>`. Portal configuration (`schemaUrl`,
`loginRoute`, `debug`) is declared in the realm's config under `portal:` and accessed via
`blong.config.portal`:

```ts
export default handler<{shouldRender?: boolean; portal?: IBlongPortalConfig}, {container?: ...}>(
    (blong) => {
        const {config: {shouldRender}} = blong;
        return async function ready(params, _$meta) {
            const [{default: React}, {default: ReactDOM}, {App}] = await Promise.all([
                import('react'),
                import('react-dom/client'),
                import('../../src/components/App/App.js'),
            ]);
            this.config.context ||= {};
            this.config.context.container = params =>
                React.createElement(App, {handlerProxy: blong, log: this.log, ...params});
            if (shouldRender !== undefined && !shouldRender) return;
            ReactDOM.createRoot(rootEl).render(this.config.context.container(params));
        };
    },
);
```

The `handler` property on the proxy is wrapped with a JS Proxy that automatically emits
`blongEvents` and shows the error dialog for non-validation errors.

### `App` component

`App` accepts an `IHandlerProxy` and wraps everything in `BlongProvider` + `Theme`, then renders the
`Portal` shell:

```
App
  └── BlongProvider  (handlerProxy, schemaRegistry, TanStack QueryClient)
        └── Theme
              ├── Portal  (Menubar + TabView of open pages)
              └── ErrorDialog
```

For Storybook / testing, pass `children` instead of portal props to skip the shell.

**`App` props:**

| Prop             | Type                  | Purpose                                              |
| ---------------- | --------------------- | ---------------------------------------------------- |
| `handlerProxy`   | `IHandlerProxy`       | Required. Provides handler, config, lib, errors      |
| `log`            | `ILogger`             | Optional logger instance                             |
| `theme`          | `IThemeConfig`        | PrimeReact theme config                              |
| `loginComponent` | `React.ComponentType` | Shown when unauthenticated (no dispatch prop needed) |
| `children`       | `ReactNode`           | Bypass the portal shell (for tests/Storybook)        |

Portal config (`schemaUrl`, `loginRoute`, `debug`) goes in `handlerProxy.config.portal` (type
`IBlongPortalConfig`), not as direct `App` props.

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

| Prop           | Purpose                                                                             |
| -------------- | ----------------------------------------------------------------------------------- |
| `loadAction`   | Action name whose result populates the form (skipped when `value` is provided)      |
| `loadParams`   | Static params passed to the load action                                             |
| `createAction` | Action called on the **first** save when `mode='new'` (creates the record)          |
| `saveAction`   | Action called on save in `mode='edit'` (fallback for create when no `createAction`) |
| `onSave`       | Callback receiving the saved value on success (e.g. show a toast)                   |
| `value`        | Static initial value — bypasses `loadAction` entirely                               |

**`mode='new'` lifecycle:** When `createAction` and `saveAction` are both set, the Editor calls
`createAction` on the first save, then automatically switches to `mode='edit'` so all subsequent
saves call `saveAction`. This prevents duplicate records if the user saves, edits a field, and saves
again. **Never use a single `saveAction` pointing to `.add` for a create form** — it would call
`.add` on every save.

```ts
// Correct pattern for a create form
<Editor
    mode="new"
    createAction="marine.coral.add"   // called once, creates the record
    saveAction="marine.coral.edit"    // called on all saves after mode switches to 'edit'
    value={{}}
/>
```

**Tab title for mode-switching forms:** Pass `title` as a `Record<string, string>` keyed by mode so
the portal tab title updates when the Editor switches from `'new'` to `'edit'` after the first save.
This is JSON-serializable and translation-friendly (each string is a discrete lookup key):

```ts
// Hoisted OUTSIDE the render function — inline object literals cause an infinite update loop
const title = {new: 'Create Coral', edit: 'Edit Coral'};
<Editor mode="new" title={title} ... />
```

**Pitfall — infinite update loop:** If `title` is an inline object literal (`title={{new: '...'}}`
inside a render function), a new object identity is created on every render. The Editor reads
`titleProp` via a ref to guard against this, but hoisting the object outside the render function is
still required as a React best practice.

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

**Validation message translation:** Validation messages use `{field}` placeholder templates. The
field name is resolved to its translated label at render time. For full details, see the
**blong-i18n** skill.

### Internationalisation (i18n)

blong-browser has a lightweight string-translation system built on `appStore`. For the full details
— Text component, Button auto-translation, setTranslations/setLanguage, PrimeReact locale
registration, Storybook `lang` arg, and test patterns — see the **blong-i18n** skill.

**Key rule:** Wrap every user-visible string in `<Text>` so it participates in translation. Always
import `Button` from `@feasibleone/blong-browser` (not primereact directly) — it auto-translates
string `label` values via `Text`.

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

`IToolbarButton` key props: `label`, `icon`, `title` (native tooltip for icon-only buttons),
`action`, `method`, `enabled` (`boolean | 'dirty' | 'clean' | 'current' | 'selected'`), `confirm`,
`submit`, `menu`, `params`, `successHint`.

**Internal action names** (`__xxx__`) are handled directly by the Editor toolbar render loop and
never dispatched as RPC methods. Current internal actions:

| Name          | Effect                                                  |
| ------------- | ------------------------------------------------------- |
| `__save__`    | Submit the form (type="submit")                         |
| `__cancel__`  | Reset / cancel edits (confirms if dirty)                |
| `__edit__`    | Switch to edit mode                                     |
| `__refresh__` | Invalidate TanStack Query caches for `refreshNamespace` |
| `__design__`  | Toggle design mode (toolbar right only)                 |

Do **not** pass an `__xxx__` action name to `ActionButton` — it will attempt an RPC call and fail
with a "Method binding failed" error. All internal actions must be handled inside `Editor.tsx`'s
`handleToolbarAction` function.

### Design mode

`designable={true}` adds a cog button to the toolbar right. Clicking it activates design mode where
cards can be drag-dropped to rearrange the layout. The updated `FlatLayoutConfig` is communicated
back via `onLayoutChange`. Design mode is a `DesignModeContext`-based feature that wraps the form in
a `DndContext` for drag-and-drop.

### Form Inspector (debug)

When the `BlongProvider` is configured with `config.portal.debug: true`, a **Form Inspector** side
panel appears next to the form showing live state useful for development:

| Section              | Shows                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------- |
| **Fields**           | Per-field dirty (D) / touched (T) / error (E) badges                                     |
| **Values**           | Live form values (updates on every keystroke via `useWatch`)                             |
| **Table Selections** | Row/index selection state for table widgets                                              |
| **State**            | `editorMode`, `editorLayout`, `readOnly`, `loading`, `isDirty`, `isValid`, `submitCount` |

`editorMode` (`'new'` / `'edit'` / `'view'`) and `editorLayout` (resolved layout key, e.g.
`'editSplit'`) are passed from the Editor down into the Form's `IFormStateContext` so the Inspector
can display them. They update in real time when the Editor mode switches (e.g. after the first save
of a create form).

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

**Steps layout** — same as tab but with `type: 'steps'`; renders ← indicator → nav bar. The forward
→ button is `type="submit"` on the last step, triggering form submission.

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
- `watch` — makes a reactive detail card (see Master-Detail below)
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

- **`adapter/backend.ts`** (`backend` namespace) — HTTP JSON-RPC via `adapter.http` +
  `codec.jsonrpc` + `codec.mle`. All back-end calls from the browser go through this adapter.
- **`adapter/mock.ts`** (`backend` namespace, `storybook`/`integration` environments only) —
  Discovers `.model` and `.fixture` handlers from realm layers; auto-generates `find`, `get`, `add`,
  `edit`, `remove`, `report`, `schema`, and `{subject}.dropdown.list` handlers for each model. The
  suite config must include `{blongUi: {mock: {}}}` to activate this adapter.
- **`adapter/storage.ts`** (`storage` namespace) — browser storage via `adapter.dispatch`.
- **`orchestrator/portal.ts`** (`portal.*`, `component.*`, `action.*`) — imports handlers matching
  `/\.model$/`, `/\.component$/`, `/\.portal$/`, `/\.action?$/`. Realms contribute pages and actions
  by naming files with these suffixes or by using the `model()` factory.
- **`orchestrator/auth.ts`** (`auth.*`) — `authLogin`, `authLogout`, `authSessionGet`.

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
| `language`           | Active locale code (e.g. `'en'`, `'bg'`)    |
| `translations`       | Key→value translation dictionary            |

---

## Event bus

`blongEvents` is a singleton typed event bus emitted automatically by `BlongContext`'s
`wrapHandlerProxy`. Subscribe with `blongEvents.on(event, handler)` — returns an unsubscribe fn.

| Event            | Payload                    | When fired                     |
| ---------------- | -------------------------- | ------------------------------ |
| `action:before`  | `{method, params}`         | Before every dispatch call     |
| `action:success` | `{method, params, result}` | After a dispatch call resolves |
| `action:error`   | `{method, params, error}`  | After a dispatch call rejects  |

---

## React context — `useBlong`

`useBlong()` is the primary context hook. It returns an `IBlongContextValue`:

```ts
const {handler, config, lib, errors, schemaRegistry, queryClient, log} = useBlong();
```

| Property         | Type                                                      | Purpose                                               |
| ---------------- | --------------------------------------------------------- | ----------------------------------------------------- |
| `handler`        | `IRemoteHandler` (Proxy)                                  | Call any registered method: `handler[method]({}, {})` |
| `config`         | `Record<string, unknown> & {portal?: IBlongPortalConfig}` | Runtime config (includes `portal.schemaUrl` etc.)     |
| `lib`            | `ILib`                                                    | Library functions from the handler proxy              |
| `errors`         | `object`                                                  | Typed domain errors                                   |
| `schemaRegistry` | `ISchemaRegistry`                                         | Fetch + cache enriched OpenAPI schemas                |
| `queryClient`    | `QueryClient`                                             | TanStack Query client                                 |
| `log`            | `ILogger`                                                 | Logger instance                                       |

`BlongProvider` is the context provider. `makeHandlerProxy(dispatch, config?)` creates a minimal
`IHandlerProxy` from a dispatch function — used in tests and Storybook:

```ts
import {BlongProvider, makeHandlerProxy, useBlong} from '@feasibleone/blong-browser';

// In a component:
const {handler, config} = useBlong();
const loginRoute = config.portal?.loginRoute;
await handler['marine.coral.find']({}, {});

// In tests / Storybook:
<BlongProvider handlerProxy={makeHandlerProxy(dispatchFn, {portal: {schemaUrl: '/schema.json'}})}>
    ...
</BlongProvider>
```

**`handler` call convention:** Always pass two arguments — `(params, $meta)`. Use `{}` for both when
no specific params or meta are needed: `handler['method.name']({}, {})`.

**`IBlongPortalConfig`** fields: `schemaUrl`, `baseUrl`, `debug`, `loginRoute`.

---

## Component summary

| Component      | Purpose                                                                    |
| -------------- | -------------------------------------------------------------------------- |
| `App`          | Top-level composition root; wraps provider + theme + portal                |
| `Portal`       | Menubar + TabView shell; opens actions as tabs                             |
| `Editor`       | Form + toolbar + load/save lifecycle; schema-driven page editor            |
| `Form`         | react-hook-form wrapper; Card grid; owns all form state                    |
| `Explorer`     | DataTable list view + toolbar + optional tree navigator                    |
| `Report`       | Filter form + metrics summary cards + read-only DataTable                  |
| `Card`         | Labelled container for a group of widgets                                  |
| `Deck`         | PrimeFlex grid column; stacks one or more cards                            |
| `Button`       | PrimeReact Button wrapper; auto-translates string `label` via `Text`       |
| `Text`         | Inline text with auto-translation; children used as key + English fallback |
| `ActionButton` | Button wired to an action name via dispatch                                |
| `Navigator`    | Tree navigator panel for hierarchical browsing                             |
| `ThumbIndex`   | Tabbed index navigation (letter or custom groups)                          |
| `Page`         | Simple page wrapper with title and breadcrumb                              |
| `Permission`   | Render children only if `checkPermission(key)` passes                      |
| `Login`        | Login form; calls `auth.login` action on submit                            |
| `Theme`        | PrimeReact theme loader; registers custom locales; activates active locale |

---

## Storybook

There are **two Storybook setups**:

### `core/blong-browser/.storybook/` — component-level stories

Stories live in `src/components/*/` as `*.stories.tsx`. Used for developing and testing individual
components (`Editor`, `Explorer`, `Form`, widgets) in isolation.

The `.storybook/dispatch.tsx` provides a mock handler proxy. Fixture data and handler stubs come
from `@feasibleone/blong-marine/meta/storybook.js`. Use `withDispatch(overrides)` as a decorator:

```ts
export default {
    decorators: [
        withDispatch({
            coralCoralGet: () => Promise.resolve(coralStoryValue),
        }),
    ],
};
```

`withDispatch` internally calls `makeDispatch(overrides)` which returns an `IHandlerProxy` built
with `makeHandlerProxy`. Portal config (`schemaUrl`, `loginRoute`, `debug`) is embedded in
`handlerProxy.config.portal` and passed to `<App handlerProxy={...}>`.

`makeDispatch(overrides?)` — exported utility that builds a standalone handler proxy from the
default handlers merged with overrides. Useful for unit tests that need a handler proxy without a
React tree.

Named handlers in `dispatch.tsx` follow the pattern `{entity}{Entity}{Verb}`:

- `coralCoralGet` — resolves immediately with fixture data
- `coralCoralLoad` — never resolves (skeleton state)
- `coralCoralEditError` — rejects with server-side validation errors

### `core/ui-demo/.storybook/` — model page stories

Uses `withBlong(browser)` from `@feasibleone/blong-browser/storybook.tsx` which loads the full blong
platform (including the mock adapter) so model pages work without a running server. Stories use the
`Model` component:

```tsx
import {Model} from '@feasibleone/blong-browser';
export const CoralBrowse = {render: () => <Model componentName="marine.coral.browse" />};
```

The `page()` helper in `src/storyHelper.tsx` simplifies this further — see the blong-model skill.

### Common Storybook conventions

**Language / translations:** Set `lang: 'bg'` (or any registered locale code) as a story arg —
`withDispatch` activates translations and PrimeReact locale automatically. See the **blong-i18n**
skill for setup details.

```ts
export const ToolbarBG: StoryFn = Template.bind({});
ToolbarBG.args = {lang: 'bg'};
```

**Toast notifications:** The global `withDispatch` decorator shows a success toast after mutations
(excludes `portal.dropdown.list` and methods ending with `Get/Load/Find/List/Fetch`). Control per
story via `decorators: [withDispatch({}, {notify: false})]` (suppress), `{notify: ['method.name']}`
(specific), or `{notify: true}` (all).
`NotifyConfig = boolean | string[] | ((method: string) => boolean)`.

**`play()` functions:** Use the modern Storybook 10 pattern — `canvas` and `userEvent` are provided
as play context args (`canvas` is pre-scoped, no need for `within`). Run play functions in unit
tests by passing `{canvas: within(container), userEvent}`. For translated stories, see
**blong-i18n** for which labels are translated and which aren't.

```ts
MyStory.play = async ({canvas, userEvent}) => {
    await userEvent.click(await canvas.findByText('Row label'));
    // A small wait may be needed in Storybook (real browser, real CSS transitions).
    // In vitest unit tests cssTransition is disabled so no wait is necessary there.
    await new Promise(r => setTimeout(r, 200));
};
```

**Important**: `<Form>` must always have a real `onSubmit` handler attached (via `handleSubmit` even
when no `onSubmit` prop is provided) — otherwise the browser will navigate on form submit.

### Unit test conventions for blong-browser

Tests live in `src/**/*.test.tsx` and run with Vitest (`npx vitest run`).

**Test render wrapper** (`src/test/render.tsx`): Use `render()` from `../../test/render.js` — it
wraps the component in `PrimeReactProvider value={{cssTransition: false, ripple: false}}` and
`BlongProvider` (via `makeHandlerProxy`). This disables all PrimeReact animations, so overlays and
dropdowns open synchronously with no real-time delays.

**`pr_id_*` normalisation** (`src/test/setup.ts`): A snapshot serializer strips PrimeReact's
internal incrementing component IDs (`pr_id_55=""`, `aria-controls="pr_id_55_panel"`, …) from every
DOM snapshot. This makes snapshots counter-independent — they reflect structure, not identity.

**No `setTimeout` waits**: Because dispatch mocks resolve immediately and transitions are
synchronous, arbitrary `setTimeout` waits are not needed. `await findByTestId(...)` and
`await waitFor(...)` already yield to pending microtasks on their first poll. Do not add
`await act(async () => { await new Promise(r => setTimeout(r, N)); })` guards unless a test
genuinely depends on real elapsed time (e.g. debounce logic).

**`act()` warnings from PrimeReact**: PrimeReact's Dropdown/Select components schedule
focus-management callbacks via `setTimeout(0)`. These fire during `@testing-library/react`'s
`waitFor()` polling window, where `IS_REACT_ACT_ENVIRONMENT` is temporarily set to `false` by the
library's internal `asyncWrapper`. The combination produces harmless "not configured to support act"
noise in console output when play() functions call `canvas.findByText()` or similar async queries.
`src/test/setup.ts` suppresses this specific message globally (and only this message) since it is a
known PrimeReact + testing-library incompatibility — not a defect in our code. All other
console.error output is preserved.

**`flushEffects` helper** (`src/test/render.tsx`): Drains the macro-task queue inside `act()` so
PrimeReact's post-interaction focus-management timers are flushed before the final `findByTestId`
snapshot assertion. Use it after `await act(() => Story.play!({...}))` calls that trigger user
interactions on PrimeReact components, and before play() is called (to drain initial-render timers):

```tsx
if (MyStory.play) {
    await flushEffects(); // drain initial-render PrimeReact timers
    await act(() => MyStory.play!({canvas: within(container), userEvent: userEvent.setup()}));
    await flushEffects(); // drain post-interaction timers
}
```

**Zustand store mutations in tests**: If a test mutates global Zustand store state (e.g. calling
`useAppStore.getState().setTranslations(...)`) and components that subscribe to that store are
mounted, wrap the mutations in `await act(async () => { ... })` so React processes the resulting
re-renders inside act. This applies to both setup and tear-down (`finally`) blocks.

**Snapshot tests**:

```tsx
it('Basic render equals snapshot', async () => {
    const {findByTestId} = render(<Basic />, {dispatch});
    expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
});
```

After interactions via a `play()` function, wrap it in `act` and flush PrimeReact timers:

```tsx
it('After interaction equals snapshot', async () => {
    const {findByTestId, container} = render(<MyStory />, {dispatch});
    if (MyStory.play) {
        await flushEffects(); // drain PrimeReact init timers before play() calls findByText
        await act(() => MyStory.play!({canvas: within(container), userEvent: userEvent.setup()}));
        await flushEffects(); // drain post-interaction PrimeReact timers
    }
    expect(await findByTestId('blong-browser-test')).toMatchSnapshot();
});
```

Update stale snapshots with `npx vitest run -u`.

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

1. **Model handlers** (`.model` kind via the `model()` factory) — auto-generate
   Browse/New/Open/Report pages. Discovered by the portal orchestrator via `/\.model$/` pattern.
   This is the recommended approach for standard CRUD entities.
2. **Component handlers** (file ending in `.component`) — manual page handlers returning
   `{title, permission, component: () => import('...')}`. Used for custom pages beyond standard
   CRUD.
3. **Actions files** (file ending in `.actions`) — named `IAction` records for mutations and
   queries.
4. **Portal config files** (file ending in `.portal`) — define menu structure referencing those
   actions/components.

The portal orchestrator imports all matching handlers automatically without direct realm coupling.

## Debugging tips

Check for any shared browser tabs, where the one using localhost:6006 is the blong-browser Storybook
and another one hosted on chromatic.com. Use them to verify blong-browser is working as expected
(e.g. the expected is on chromatic.com). Open the iframes to avoid the Storybook UI getting in the
way.

---

## Related skills and documentation

- **blong-model-dev** — Use when developing or improving `src/model/` internals
  (subjectObjectComponent, entry factories, dropdownRegistry, defaults, mock system).
- **blong-model** — Use when a realm needs to define `IModelSpec` objects and use the model system
  to generate CRUD pages.
- **blong-i18n** — Use when adding multi-language support, translating labels or validation
  messages, wiring PrimeReact locale, or adding a `lang` story arg.

Documentation:

- [Browser UI concept](../../../docs/blong/docs/concepts/browser-ui.md)
- [blong-browser Model concept](../../../docs/blong/docs/concepts/blong-model.md)
- [Editor Features](../../../docs/blong/docs/concepts/editor-features.md)
- [blong-browser Pattern](../../../docs/blong/docs/patterns/blong-browser.md)
- [blong-browser Model Pattern](../../../docs/blong/docs/patterns/blong-model.md)
- [Metadata-Driven UI rationale](../../../docs/blong/docs/rationale/metadata-driven-ui.md)
