# Metadata-Driven UI

## Problem

Building user interfaces for data-centric applications involves a large
amount of repetitive work. For every API endpoint a developer must create
a form, a table, a detail view — each with field labels, validation
rules, formatters and layout. When the API changes (a new field, a
renamed property, a tighter constraint), the UI must be updated in
lockstep. This is error-prone, slow and expensive.

Enterprise applications make the problem worse: they may have hundreds of
entities, each with dozens of fields, multiple CRUD operations and
role-based visibility rules. Writing bespoke React components for every
screen does not scale.

For how this vision is realised in blong-browser see:

- [Browser UI](../concepts/browser-ui.md) — concept
- [Model System](../concepts/blong-model.md) — concept
- [Modular UI](../patterns/blong-browser.md) — how-to guide
- [Schema based UI](../patterns/blong-model.md) — how-to guide for the model system

## Prior Art: react-jsonschema-form

The open-source library [react-jsonschema-form](https://github.com/rjsf-team/react-jsonschema-form) provides a
similar approach by generating forms from JSON Schema definitions. It supports validation, custom widgets, and layout
customization, allowing developers to focus on the data model rather than the UI implementation. However, it is
primarily focused on form generation and does not provide a complete solution for building complex CRUD interfaces,
navigation, or integration with backend APIs. blong-browser builds on the idea of schema-driven UI but extends it to
cover the full spectrum of UI needs in an enterprise application, including layouts, tables, detail views, role-based
access control, translation and a modular architecture for contributing pages from multiple realms. It is also
well aligned with the Blong framework's architectural principles and patterns.

## Prior Art: ut-prime and ut-model

The [UT framework](https://github.com/softwaregroup-bg/ut-prime)
addressed this problem with a metadata-driven approach:

- **ut-model** defined declarative "models" — JavaScript objects that
  described pages, cards, fields and their relationships. Each model
  referenced API methods by name and described how the request/response
  properties should map to UI elements (columns, form fields, filters).

- **ut-prime** consumed these models and translated them into a live
  React UI built on PrimeReact. It provided:
  - Automatic form generation from models
  - Automatic table generation with sorting, filtering and pagination
  - An interactive **design editor** that allowed non-developers to
    rearrange fields, change widget types and persist the layout
  - A component library (`Editor`, `Explorer`, `Inspector`, `Report`)
    that combined forms, tables and toolbars into standard CRUD patterns

- The result was that adding a new entity to the UI often required
  nothing more than defining a model and the corresponding API handlers.
  The framework took care of rendering.

### What ut-prime Got Right

A review of ut-prime's source code reveals a sophisticated and
well-designed system that Blong should learn from, not just replace:

1. **react-hook-form integration**: ut-prime already uses react-hook-form
   with `FormProvider`, `useForm`, `@hookform/resolvers/joi` for
   validation, and `@hookform/devtools` for debugging. The Form component
   uses `handleSubmit`, `formState` (errors, isDirty, isSubmitting,
   dirtyFields), `watch`, `setError`, `clearErrors` and `reset`. This is
   a mature integration — Blong replaces the Joi resolver with a
   TypeBox/JSON Schema resolver but keeps the same react-hook-form
   patterns.

2. **Cards and layouts model**: ut-prime has a rich composition model:
   - **Cards** are named groups of fields (`widgets` arrays) with
     `label`, `className` for layout control, `hidden`, `watch`/`match`
     for conditional visibility, and `permission` for access control.
   - **Layouts** are named configurations keyed by mode
     (`editDefault`, `createFoo`, etc.) supporting tabbed navigation
     (`ThumbIndex`), `orientation` (left/top), nested `items` following
     PrimeReact's MenuModel API, and `disabled`/`enabled` field lists.
   - The `useCustomization` hook merges default schema, cards and
     layouts with per-component customisations at runtime.

3. **Design editor**: The drag-and-drop design editor (`ConfigField`,
   `ConfigCard`, `Inspector`) allows rearranging fields between cards,
   adding/removing cards from layouts, and inspecting/editing individual
   field and card properties — all with live preview.

4. **Dropdown workflow**: Dropdown field names are discovered
   automatically from the schema/layout via `fieldNames()`. The
   `onDropdown` callback is called with the discovered names and returns
   a `Dropdowns` map. This avoids manual wiring of every select field.

5. **Form submission pattern**: ut-prime uses a `trigger` pattern —
   `setTrigger` sets a callback when the form is dirty, which the
   toolbar's Save button calls. The submit function receives a 3-element
   tuple `[formData, layoutState.index, event]`. `prepareSubmit`
   transforms form data before sending to the API. The form tracks
   `$original` (snapshot of loaded data) and `$modified` (dirty flag).

6. **Customisation persistence**: Layout customisations are persisted via
   `portal.customization.edit` and retrieved via
   `portal.customization.get`, keyed by `componentId`. The stored
   config has `schema`, `card` and `layout` sections that are merged
   with the defaults at runtime.

7. **Three widget categories**: ut-prime classifies widgets into three
   categories that cover virtually all data-entry needs:
   - **Scalar**: primitive-value widgets — input, password, text,
     mask, number, currency, integer, boolean, date, time, datetime,
     dropdown, dropdownTree, select.
   - **Scalar array**: multi-select widgets backed by a list —
     multiSelect, multiSelectTree, selectTable, multiSelectPanel,
     multiSelectTreeTable. These represent arrays of scalar values
     (e.g. selected IDs from a relational database).
   - **Vector array**: table widgets that edit arrays of objects. Columns
     are defined by nested `widgets` arrays.

8. **Advanced UI patterns**: ut-prime implements a family of composable
   patterns for complex data relationships:
   - **Cascaded dropdowns** — a `parent` property on dropdown widgets
     links them hierarchically (e.g. continent → country → city).
     Dropdown data includes a `parent` field for automatic filtering.
   - **Cascaded tables** — `master` and `parent` properties configure
     parent-child table filtering via `$.selected.xxx` form state.
   - **Master-detail** — a detail card with `watch: '$.selected.xxx'`
     edits the selected table row. Edit widgets reference
     `$.edit.xxx.propertyName` from internal form state.
   - **Static pivot** — pre-populates a table with static data (e.g.
     weekdays) via `pivot.examples` + `pivot.join`.
   - **Dynamic pivot** — pre-populates a table with dropdown list data
     via `pivot.dropdown` + `pivot.join` (e.g. permission matrix).
   - **Polymorphic layout** — a `typeField` property selects layouts
     dynamically based on the data type (e.g. `editPerson` vs
     `editOrganization`). Falls back from `createXyz` to `editXyz`.
   - **Polymorphic master-detail** — combines master-detail with
     polymorphic card visibility via `watch`/`match`.

9. **Custom widget escape hatch**: An `editors` property on the Editor
   allows passing custom React components as widgets. Each receives
   `Input`, `Label`, `ErrorLabel` internal components as props and
   declares its properties via a static `.properties` array.

10. **Internal form state with `$` prefix**: The Editor maintains
    transient state under the `$` property — `$.edit.xxx` for the
    currently edited table row, `$.selected.xxx` for the selected row.
    These properties are automatically excluded during form submission.

11. **File upload**: ut-prime supports file upload by switching from
    `application/json` to `multipart/form-data`. Regular properties are
    serialized as a single JSON with name `$`; file properties are
    serialized individually with path-based names
    (e.g. `$.document.documentIcon`). The server handler receives objects
    with `originalFilename`, `headers` and temp file `filename`.

12. **Portal menu structure**: Portals define their menu via a
    `portal.params.get` handler returning `{theme, portalName, menu}`.
    Menu items are arrays of `{title, items}` using
    `portalMenuItem(component$xxx)`. Component handlers follow
    `subject.object.predicate` naming: `.browse` for lists, `.new` for
    creation, `.open` for editing (receives `{id}` prop).

### Lessons Learned

While ut-prime proved the concept and contains genuinely good patterns,
there are areas where Blong can improve:

1. **Separate model layer**: ut-model defines models in a custom DSL-like
   JavaScript format, separate from both the API schema and the React
   components. This introduces a third source of truth alongside the
   TypeBox/OpenAPI schema and the handler types.

2. **Joi-based validation**: ut-prime uses `@hookform/resolvers/joi` for
   form validation. Blong uses TypeBox everywhere, so the resolver should
   use JSON Schema / TypeBox directly — eliminating the need for Joi as a
   dependency.

3. **Older PrimeReact version**: The component mappings target an older
   PrimeReact API. Newer versions have improved accessibility,
   unstyled mode and design token support.

4. **Bundle size**: The build used Webpack with limited tree-shaking. All
   components were bundled even if unused.

5. **Runtime overhead**: Models were resolved at runtime through multiple
   layers of merging and indirection, making debugging harder.

6. **CI/CD**: Jenkins pipelines were used; GitHub Actions offer tighter
   integration with the source repository.

7. **JSS styling**: ut-prime uses `react-jss` (JSS) for styling. Modern
   PrimeReact with unstyled mode and design tokens removes the need for
   a separate CSS-in-JS library.

## Solution

Blong derives UI metadata directly from the **TypeBox schemas** that server-side
handlers already define. Those schemas flow through to the OpenAPI document, and
the UI reads that document to generate forms, tables, and validation rules
automatically. The key principle: **the TypeBox type written for a handler is
the model** — no separate model layer is needed.

The implementation (`core/blong-browser`) contains a schema registry that fetches and
enriches per-subject OpenAPI documents at runtime, a widget resolution layer that
maps JSON Schema types and extension fields to PrimeReact components, and four
high-level page components (Editor, Explorer, Report, and their model-driven
counterparts) that build complete CRUD screens from the enriched schema.

## Blong's Approach

Blong improves on the ut-prime/ut-model concept by:

### 1. Single Source of Truth: OpenAPI + TypeBox

Instead of a separate model layer, Blong derives UI metadata directly
from the **OpenAPI schema** that the server already generates from
TypeBox types. The schema contains:

- Property names, types, formats, constraints
- Descriptions and titles (used as labels)
- Required fields (used for validation)
- Enums (used for dropdowns)
- Extension fields (`x-widget`, `x-filter`, `x-sort`, `x-hidden`) for
  UI-specific hints that have no equivalent in standard JSON Schema

This eliminates the need for ut-model's custom model definitions. The
TypeBox types that developers write for their handlers **are** the model.

A thin **browser-side overlay** (`IModelSpec`) can enrich the server
schema with display hints and dropdown references that the server does
not need to know about. This is how realms add per-object UI details
without server changes. The overlay does not replace the server schema —
it augments it.

### 2. TypeBox Resolver Instead of Joi

ut-prime already uses react-hook-form — so Blong does not need to
introduce it. What Blong changes is the **validation resolver**: instead
of `@hookform/resolvers/joi`, Blong uses a TypeBox / JSON Schema
resolver so that the same TypeBox types that define the server handlers
also drive browser-side form validation. This eliminates Joi as a
dependency entirely.

The technology stack is:

- **react-hook-form** — form state, validation and submission
- **TanStack Query** — server state caching (used inside the browser
  adapter layer only, never imported directly in UI components)
- **Zustand** — lightweight global portal and auth state
- **PrimeReact** — component library providing all rendered widgets

### 3. Latest PrimeReact

Blong targets the current PrimeReact release, taking advantage of
CSS-variable theming, improved accessibility, pass-through props, and
tree-shakeable bundles via Vite.

### 4. Vite Toolchain

Vite replaces Webpack and provides instant HMR, native ESM (the same
module format used on the server), automatic code-splitting, and
first-class TypeScript support.

### 5. Two-Level Schema Enrichment

Metadata flows through two levels:

1. **Server level** — TypeBox schemas generate an OpenAPI document at
   `GET /rpc/{subject}/openapi.json`. Standard JSON Schema
   properties (type, format, enum, required, title) describe the data.
   Server-side UI hints (`x-filter`, `x-sort`, `x-widget`, `x-hidden`)
   communicate display preferences from the owner of the API.

2. **Browser level** — a browser-side `IModelSpec` overlay adds or
   overrides field metadata (widget type, dropdown references, card
   groupings, layout configuration) without any server change. These
   overrides are compiled into the realm's component handler.

This layering lets server teams define clean TypeBox schemas and browser
teams tune visual presentation independently.

### 6. Interactive Design Editor _(Not yet implemented)_

> **Note:** The design editor described below is planned but not yet part of
> `core/blong-browser`. It will be built after the base form and table
> generation is stable and fully covered by Storybook stories.

The design editor from ut-prime is retained as a first-class feature:

- Drag-and-drop card rearrangement on a page grid
- Field visibility toggle per role
- Widget type selector with live preview
- Layout persistence — saved to the server keyed by page and tenant

### 7. Micro-Frontend Model

Realms contribute pages, actions, and portal configuration without
importing each other's code. The portal orchestrator discovers component
handlers by file-name convention (`*.component`, `*.actions`, `*.portal`)
and wires them through the handler namespace — the same mechanism used
for server-side inter-realm communication.

### 8. Model-Driven CRUD Factory

For the common 80 % of CRUD screens, the `modelFactory()`
function accepts an array of `IModelSpec` objects and automatically
generates Browse / New / Open / Report pages for each entity.
This eliminates the need to write individual page components for standard
list/edit workflows.

## Trade-offs

- **Runtime schema fetching** adds a network round-trip at startup. This
  is mitigated by per-subject caching and by the option to bundle schema
  snapshots for production builds.
- **Extension fields** (`x-widget`, etc.) are not part of the OpenAPI
  standard. They are valid per the specification's extension mechanism,
  but third-party tools may ignore them.
- **Generated UIs are generic**. Highly custom screens still need
  hand-written components. The goal is to cover the 80 % of CRUD screens
  automatically and provide escape hatches for the remaining 20 %.

## Future Ideas

1. **AI-assisted schema annotation** — a tool that inspects handler
   signatures and TypeBox schemas and suggests `x-widget` annotations.
   A developer reviews and accepts suggestions rather than writing
   annotations manually.

2. **Schema diff notifications** — when a deployed handler's OpenAPI
   schema changes, notify developers that specific screens may need
   layout review, closing the gap between server-side changes and UI
   updates.

3. **Progressive disclosure** — conditional card visibility based on
   form field values (e.g., show the "Wire Transfer Details" card only
   when `paymentMethod` is `'wire'`), reducing form complexity without
   custom React code.
