# Browser UI

The browser platform extends the Blong framework to deliver rich,
metadata-driven user interfaces that run entirely in the web browser. It
reuses the same architectural building blocks — suites, realms, layers,
adapters, orchestrators and handlers — but adapts them to the constraints
and opportunities of the browser environment.

## Core Idea

The server already exposes OpenAPI schemas, validation metadata and
handler definitions. The browser platform consumes this information at
runtime to **automatically generate** forms, tables, detail views and
other UI components — without requiring developers to write bespoke JSX
for every screen. When the server API changes, the UI updates
accordingly.

This metadata-driven approach was pioneered in
[ut-prime](https://github.com/softwaregroup-bg/ut-prime) and
[ut-model](https://github.com/softwaregroup-bg/ut-model). Blong carries
the concept forward with modern React, a Vite-based toolchain, and
tighter integration with the framework's type system.

For the design rationale see
[Metadata-Driven UI](../rationale/metadata-driven-ui.md).

## Layers in the Browser

The following layers have specific meaning in the browser platform:

| Layer         | Purpose |
|---------------|---------|
| `backend`     | Adapter that communicates with the Blong server gateway over JSON-RPC (or REST). Uses `ky` / Fetch. |
| `component`   | React component handlers that define UI pages, cards and widgets. Each handler returns a React component. |
| `orchestrator` | Browser-side business logic that coordinates multiple backend calls and manages derived state. |
| `test`        | Playwright / Storybook interaction tests that run against the rendered UI. |
| `init`        | Browser-specific initialisation: theme loading, locale detection, service worker registration. |

These names are already recognised by the framework's well-known layer
discovery (see `WELL_KNOWN_LAYERS` in `load.ts`).

## Metadata-Driven Component Generation

### Schema Discovery

When the browser platform starts, the `backend` adapter fetches the
OpenAPI definition from the server gateway (`/documentation/json`). This
definition contains:

- Path and method information for every endpoint
- Request/response JSON Schema (`TypeBox` generated)
- Descriptions, titles and examples
- Extension fields (`x-blong-*`) for UI hints such as column order,
  default sort, component type overrides and widget configuration

### Component Factory

A **component factory** turns a JSON Schema into a React component tree:

1. **Form generation** — each property in a request schema becomes a form
   field. The factory picks a PrimeReact input component based on the
   property type and `x-blong-widget` hint. Field labels come from
   `title` or `description`. Validation rules come from `minimum`,
   `maxLength`, `pattern`, `required`, etc.
2. **Table generation** — each property in a response array item schema
   becomes a column in a PrimeReact DataTable. Column headers use
   `title`, formatters use the property type.
3. **Detail view generation** — a single response object schema becomes
   a read-only detail panel.

### react-hook-form Integration

All generated forms use [react-hook-form](https://react-hook-form.com/)
for state management. The schema-to-form mapping:

- Registers every field via `useForm` / `useFormContext`
- Applies validation rules derived from the JSON Schema
- Uses `Controller` for PrimeReact components that are not natively
  compatible with `register`
- Supports nested objects via dot-notation field names
- Supports arrays via `useFieldArray`

### PrimeReact Component Library

[PrimeReact](https://primereact.org/) provides the component primitives.
The component factory maps JSON Schema types to PrimeReact components.

#### Widget Categories

Widgets fall into three categories, matching the ut-prime taxonomy:

**Scalar widgets** — edit or display a single primitive value:

| JSON Schema type / format | `x-blong-widget` | PrimeReact component |
|---------------------------|-------------------|---------------------|
| `string`                  | (default)         | InputText           |
| `string`                  | `password`        | Password            |
| `string`                  | `text`            | InputTextarea       |
| `string`                  | `mask`            | InputMask           |
| `string` + `date`         | `date`            | Calendar            |
| `string` + `time`         | `time`            | Calendar (timeOnly) |
| `string` + `date-time`    | `date-time`       | Calendar (showTime) |
| `string` + `enum`         | `dropdown`        | Dropdown            |
| `string` + `enum`         | `dropdownTree`    | TreeSelect          |
| `string` + `enum`         | `select`          | SelectButton        |
| `number`                  | `number`          | InputNumber         |
| `number`                  | `currency`        | InputNumber (currency) |
| `integer`                 | `integer`         | InputNumber (integer) |
| `boolean`                 | `boolean`         | Checkbox / ToggleButton |

**Scalar array widgets** — multi-select from a list, storing arrays of
scalar values (typically IDs from a relational database):

| `x-blong-widget`         | PrimeReact component |
|---------------------------|---------------------|
| `multiSelect`             | MultiSelect         |
| `multiSelectTree`         | TreeSelect (multiple) |
| `selectTable`             | DataTable (selectionMode: single) |
| `multiSelectPanel`        | ListBox / PickList  |
| `multiSelectTreeTable`    | TreeTable (multiple) |

All scalar array widgets require a `dropdown` reference naming the
options list.

**Vector array widgets** — edit arrays of objects. The primary UI is a
table with nested column widgets:

| JSON Schema pattern                | PrimeReact component |
|------------------------------------|---------------------|
| `array` of `object` items          | DataTable (editable) |
| `array` + `x-blong-widget: table`  | DataTable with per-column widgets |

Column widgets are specified via nested `widgets` arrays in the card
definition. Each column can use any scalar widget type.

Developers can override any mapping via `x-blong-widget` in the schema
or via the interactive design editor.

### Custom Widgets

When built-in widgets are not sufficient, component handlers can provide
custom widgets via an `editors` property:

```typescript
function Period({Input, Label, ErrorLabel}) {
  return (
    <>
      <ErrorLabel/>
      <div className="field grid w-full mx-0">
        <Label name="period" /><Input name="period" />
        <Input name="unit" />
      </div>
    </>
  );
}
Period.properties = ['period', 'unit'];
```

Custom widgets:

- Receive `Input`, `Label` and `ErrorLabel` internal components as props,
  allowing reuse of built-in widget rendering
- Declare which properties they manage via a static `.properties` array
- Are referenced by name in the card's `widgets` array

### Loading States

During data loading (`onGet`, `onDropdown`), the form displays animated
skeleton placeholders instead of actual widgets, providing visual
feedback without layout shifts.

## Pages, Cards and Layouts

The UI composition model is inspired by ut-prime's proven card/layout
system but driven entirely from schema metadata.

### Cards

A **card** is a named group of fields (widgets). Each card defines:

- **`widgets`** — an ordered array of field names (strings) drawn from
  the schema's properties. Nested arrays within `widgets` describe
  sub-groups for layout purposes (e.g. placing two fields side by side).
- **`label`** — optional display title for the card header.
- **`className`** — PrimeFlex CSS class for column sizing
  (e.g. `'lg:col-6 xl:col-4'`). Defaults to `'xl:col-6'` (two columns
  on large screens).
- **`hidden`** — hides the card from default rendering (useful for
  cards that are only shown in specific modes).
- **`watch` / `match`** — conditional visibility: the card is only
  rendered when a watched field value matches the `match` object.
- **`permission`** — the permission string required to render this card.

Cards are the primary composition unit. They are defined either:

- **In the schema** via `x-blong-cards` extension, or
- **In the component handler** as a cards configuration object.

### Layouts

A **layout** configures how cards are arranged on a page for a specific
mode. Layout names follow the convention `{mode}{TypeName}`:

- `editDefault`, `createDefault` — standard edit/create layouts
- `editFoo`, `createBar` — type-dependent layouts (when `typeField` is
  set, the entity type selects the layout)

Each layout can be:

- **A simple array** of card names (or nested arrays for side-by-side
  cards)
- **A tabbed structure** with `items` (following PrimeReact's MenuModel
  API), `orientation` (`'left'` or `'top'`), and `type` for the tab
  navigation style

Layout properties:

- **`orientation`** — tab index position (`'left'` or `'top'`)
- **`items`** — array of tab items, each with `label`, `icon` and
  `widgets` (card name array)
- **`disabled` / `enabled`** — field-level override arrays
- **`disableBack` / `hideBack`** — controls for the tab back button

### Pages

A **page** is a routable top-level view registered via React Router.
Pages are defined by component handlers using the `handler()` API.
A page typically contains one or more cards arranged according to its
layout configuration.

### Runtime Model

At runtime, the framework resolves the active layout by:

1. Looking up `layouts[mode + capitalised(layoutName)]`
2. Falling back to `layouts['edit' + capitalised(layoutName)]` if not
   found
3. Resolving the card list from the layout and the card definitions
4. Merging customisation overrides (schema, cards, layouts) on top of
   the defaults

## Dropdown and Lookup Fields

Dropdown fields are resolved through an automatic discovery workflow
inspired by ut-prime's `onDropdown` pattern:

1. **Discovery**: When a form or table is rendered, the framework scans
   the active layout's cards to find all fields that require dropdown
   options. This includes fields with `enum`, `x-blong-lookup`, or
   schema references to lookup entities.

2. **Batch fetch**: All discovered dropdown field names are collected
   into a single `onDropdown(fieldNames)` call. The handler fetches
   options for all fields in one batch and returns a `Dropdowns` map
   keyed by field name.

3. **Caching**: TanStack Query caches dropdown results. Subsequent
   renders reuse cached options without re-fetching.

4. **Lookup fields**: Fields with `x-blong-lookup` specify an API method
   name (e.g. `"currency.currency.find"`). The dropdown handler calls
   this method and transforms the result into `{label, value}` pairs.

This pattern avoids the need to manually wire every select field to its
data source — the framework discovers and fetches all dropdown data
automatically.

## Form Submission and Dirty State

Blong adopts ut-prime's proven form submission patterns, adapted for
TypeBox validation:

### Trigger Pattern

The `trigger` pattern controls the Save button state:

1. The form tracks dirty state via react-hook-form's `formState`
   (`isDirty`, `dirtyFields`, `isSubmitting`).
2. When the form becomes dirty, `setTrigger` is called with a submit
   function. This enables the Save button in the toolbar.
3. When the form is clean or submitting, `setTrigger` is called with
   `undefined`, disabling the Save button.
4. The toolbar's Save button calls the trigger function, which invokes
   `handleSubmit`.

### Original Value Tracking

- On load, the form value is stored as `$original` — a deep clone of
  the loaded data. This allows comparing current values against the
  original for reset operations.
- A `$modified` field is set to `true` when the form is dirty, `false`
  otherwise.
- Reset restores the form to `$original` values.

### Submit Flow

1. The submit handler receives form data and transforms it via
   `prepareSubmit()` (strips internal fields like `$original`,
   `$modified`).
2. For new entities (no key value), calls `onAdd`. For existing entities,
   calls `onEdit`.
3. On success, the response is merged with form data to update the form
   (e.g. server-generated IDs).
4. The mode switches from `'create'` to `'edit'` after a successful add.

## Customisation Persistence

Layout customisations are persisted to the server and retrieved at
startup:

### API

| Method | Purpose |
|--------|---------|
| `portal.customization.get` | Retrieve saved customisation for a component by `componentId` |
| `portal.customization.edit` | Save customisation with `componentId` and `componentConfig` |

In Blong, these map to handler methods:

- `ui.customization.get({componentId})` → returns `{component: {componentConfig}}`
- `ui.customization.edit({component: {componentId, componentConfig}})` → persists the config

### Customisation Structure

A customisation config has three sections:

```typescript
interface Customisation {
  schema?: Schema;    // Property overrides (labels, widgets, validation)
  card?: Cards;       // Card overrides (field order, visibility)
  layout?: Layouts;   // Layout overrides (card arrangement, tabs)
}
```

These are merged with the defaults at runtime via `useCustomization`:

- `mergedSchema = merge({}, schema, customisation.schema)`
- `mergedCards = merge({}, cards, customisation.card)`
- `mergedLayouts = merge({}, layouts, customisation.layout)`

### Design Editor Flow

1. User activates design mode (toggles the ⚙ button)
2. Cards and fields become draggable (`ConfigCard`, `ConfigField`)
3. Dropping a field/card updates the local customisation state
4. An Inspector panel shows properties of the inspected field or card
5. User clicks Save → `ui.customization.edit` is called with the
   `componentId` and the customisation diff
6. On next load, `ui.customization.get` retrieves and merges the saved
   customisation

## Internal Form State (`$` Prefix)

The form maintains transient internal state under a reserved `$`
property. This state drives widget relationships without polluting the
data submitted to the server:

| State path           | Purpose |
|----------------------|---------|
| `$.selected.xxx`     | The currently selected row in table widget `xxx` |
| `$.edit.xxx`         | The row being edited in table widget `xxx` |

These properties are automatically stripped by `prepareSubmit()` before
the form data is sent to the API.

## Advanced UI Patterns

Beyond basic forms and tables, the framework supports composable
patterns for complex data relationships. These patterns are derived from
ut-prime's proven implementations:

### Cascaded Dropdowns

Dropdowns can be linked hierarchically so that selecting a value in one
filters the options in the next. Each child dropdown specifies a
`parent` property pointing to the parent field name. The dropdown data
includes a `parent` field for each option, used for automatic filtering.

Example: continent → country → city

### Cascaded Tables

Tables can be linked so that selecting a row in a parent table filters
the rows displayed in a child table. Configuration uses `master`
(property mapping between parent and child) and `parent` (reference to
`$.selected.xxx`). Child tables use `hidden` columns for relational
fields that drive the cascade.

### Master-Detail

A detail card displays or edits the selected row from a table:

- The detail card sets `watch: '$.selected.person'`
- Edit widgets reference `$.edit.person.fullName`,
  `$.edit.person.birthDate`, etc.
- Changes to the edit widgets update the row in the parent array

### Static Pivot

Pre-populates a table with static reference data (e.g. weekdays) and
joins it with the data array. Configured via:

- `pivot.examples` — the static data rows
- `pivot.join` — property mapping between static data and array items

### Dynamic Pivot

Pre-populates a table with data from a dropdown list and joins it with
the data array. Configured via:

- `pivot.dropdown` — the dropdown list name
- `pivot.join` — maps `value`/`label` from the list to array properties

Example: a permission matrix joining entities (from dropdown) with
boolean permission flags (from the data array).

### Polymorphic Layout

Different object types can display different widgets. Setting
`typeField` on the component causes it to look up a layout named
`edit{TypeValue}` or `create{TypeValue}` based on the data. Falls back
from `createXyz` to `editXyz` to `create` to `edit`.

### Polymorphic Master-Detail

Combines master-detail with polymorphic card visibility. Multiple detail
cards are included in the layout; each has a `watch` and `match`
property. Only the card whose `match` equals the selected row's type
value is rendered.

## Page Naming Conventions

Component handlers follow the `subject.object.predicate` naming pattern.
Standard page types:

| Pattern                    | Purpose |
|----------------------------|---------|
| `subject.object.browse`    | Collection view — table with search, filters, pagination |
| `subject.object.new`       | Create new entity — form in create mode |
| `subject.object.open`      | View/edit existing entity — receives `{id}` prop |
| `subject.object.report`    | Simple report — filters + read-only table |
| `subject.report.open`      | Advanced report within a subject module |

These conventions enable automatic menu generation and consistent URL
routing. When a model is defined, all standard pages are available
without additional wiring.

## Portal and Menu Configuration

A **portal** is the top-level browser application that combines realms
into a navigable UI. The portal defines:

- **Theme** — PrimeReact design tokens, dark/light mode
- **Portal name** — displayed in the header
- **Menu structure** — array of `{title, items}` groups

Each menu item is created from a component handler reference using
`portalMenuItem(component$subjectObjectBrowse)`, which extracts the
handler's `title` and `permission` to build the menu entry.

Component handler definitions return:

```typescript
{
  title: 'Entity list',           // Default menu/tab title
  permission: 'subject.object.browse',  // Required permission
  component: ({id}) => function EntityBrowse() { ... }
}
```

The `component` function can be async, allowing lazy loading and
pre-fetching of data before returning the React component.

## File Upload

The browser platform supports file upload by switching from
`application/json` to `multipart/form-data`:

- Regular form properties are serialized as a single JSON part with
  name `$`
- File properties are serialized individually with path-based names
  (e.g. `$.document.documentIcon`, `$.page.0.attachment`)
- The server handler receives file objects with `originalFilename`,
  `headers` and temp file `filename`
- File widgets in the schema use `x-blong-widget: file` and validation
  specifies the file type constraint

## State Management

Browser-side state is managed through:

- **react-hook-form** for form state (field values, validation, dirty
  tracking)
- **React Query / TanStack Query** for server state (caching, refetching,
  optimistic updates, pagination)
- **React Context** for cross-cutting concerns (theme, locale,
  authentication tokens, permissions)
- **URL state** via React Router for navigation and deep linking

There is deliberately no global state store (Redux, Zustand, etc.). The
combination of react-hook-form + React Query covers the vast majority of
use cases with less boilerplate.

## Authentication and Permissions

The browser platform integrates with `@feasibleone/blong-login`:

1. On start, the `backend` adapter calls `login.token.create` to obtain
   a JWT.
2. The JWT is stored in memory (not localStorage) and attached to every
   subsequent JSON-RPC request via the `Authorization` header.
3. The JWT payload includes a permission bitmap. Component handlers
   inspect permissions to conditionally render actions (e.g. hide the
   "Delete" button when the user lacks the `remove` permission).

## Build Toolchain

The browser platform uses **Vite** as the bundler and dev server:

- Hot Module Replacement (HMR) for instant feedback during development
- Tree-shaking and code-splitting for production builds
- Native ESM support — no CommonJS compatibility layer needed
- TypeScript and JSX/TSX support out of the box

Vite replaces the server-side `chokidar` watch mechanism. The
framework's `Watch` class is only active on the server; in the browser,
Vite's HMR handles live reloading.

## Testing

| Tool        | Purpose |
|-------------|---------|
| **Storybook** | Component development in isolation. Each component handler can export a Storybook story alongside the component. |
| **Chromatic** | Visual regression testing of Storybook stories in CI. |
| **Playwright** | End-to-end browser tests. Playwright tests run against the full Blong server + browser stack. |

### Storybook with Mocked APIs

Storybook stories can run without a real server by providing mocked API
responses. A helper function creates a mock application context:

```typescript
import {app} from 'blong-ui/storybook';

const page = app({
  implementation: 'myApp',
}, {
  'subject.object.fetch': () => ({object: [...]}),
  'subject.object.get': () => ({object: {...}}),
}, [portal()]);

export const EntityBrowse = page('subject.object.browse');
export const EntityOpen = page('subject.object.open');
```

Mocks should include enough varied data to test long texts, pagination,
multi-language labels and edge cases.

### Chromatic Visual Regression

During CI builds, Chromatic captures screenshots of every Storybook
story and compares them against the baseline. The workflow:

1. Build triggers Chromatic publish
2. If visual changes are detected, git commits show pending checks
3. Reviewers use Chromatic's visual diff tool to approve or deny changes
4. Chromatic also hosts the published Storybook as online documentation

### Playwright End-to-End Tests

Playwright tests run against the full Blong server + browser stack:

- **Test isolation**: Each test script runs with a unique user (auto-
  generated credentials), enabling parallel execution without session
  conflicts.
- **Widget identification**: Use `data-testid="xxx"` attributes and
  form input names `input[name="xxx"]` as stable locators.
- **Screenshot matching**: `expect(page.screenshot()).toMatchSnapshot()`
  captures and compares screenshots. Screenshots must be taken on the
  same OS/browser used in CI (Chromium on Linux).
- **Trace on failure**: Failed tests are retried with Playwright tracing
  enabled. Traces include timeline, network requests, browser console
  and DOM snapshots. Trace files can be inspected at
  <https://trace.playwright.dev>.
- **Test generator**: `npx playwright codegen <url>` records user
  interactions and generates test scripts as a starting point.

## Module Loading in the Browser

On the server, the framework discovers handlers by scanning the file
system (`readdir`, `chokidar`). This is not available in the browser.
Instead:

- **At build time**, Vite resolves all `import()` calls statically. Each
  realm's `browser.ts` entry explicitly lists its children, so the
  import graph is known.
- **Dynamic metadata** (OpenAPI schemas, layout configuration) is
  fetched over HTTP at runtime from the server gateway.
- **Handler registration** follows the same pattern as on the server —
  handlers are registered in the local registry and dispatched via
  `Remote` — but file-system scanning is replaced by explicit imports in
  each layer's entry point.
