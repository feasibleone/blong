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
      layouts with per-component customizations at runtime.

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

6. **Customization persistence**: Layout customizations are persisted via
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
- Extension fields (`x-blong-*`) for UI-specific hints that have no
  equivalent in standard JSON Schema

This eliminates the need for ut-model's custom model definitions. The
TypeBox types that developers write for their handlers **are** the model.

### 2. TypeBox Resolver Instead of Joi

ut-prime already uses react-hook-form — so Blong does not need to
introduce it. What Blong changes is the **validation resolver**: instead
of `@hookform/resolvers/joi`, Blong uses a TypeBox / JSON Schema
resolver so that the same TypeBox types that define the server handlers
also drive browser-side form validation. This eliminates Joi as a
dependency entirely.

All generated components use functional React with hooks:

- **react-hook-form** manages form state, validation and submission
  (same as ut-prime, but with TypeBox resolver instead of Joi).
- **React Query (TanStack Query)** manages server state — caching,
  background refetching, optimistic updates and pagination. This
  replaces ut-prime's custom per-component data loading.
- **React Context** replaces the need for a global store for
  cross-cutting concerns (auth, theme, locale).
- **React Router** handles client-side navigation with URL-based state.

### 3. Latest PrimeReact

Blong targets the current PrimeReact release, taking advantage of:

- **Unstyled mode** with design tokens — allows full theming without
  CSS overrides
- **Pass-through props** — fine-grained control over every DOM element
- **Improved accessibility** — WCAG 2.1 compliance out of the box
- **Smaller bundle** — unused components are tree-shaken by Vite

### 4. Vite Toolchain

Vite replaces Webpack and provides:

- Instant HMR during development (no full rebuilds)
- Native ESM — the same module format Blong uses on the server
- Automatic code-splitting per route
- First-class TypeScript and JSX support
- Plugin ecosystem for SSR, PWA, etc. if needed later

### 5. Extension Fields for UI Hints

Standard JSON Schema is not enough to describe every UI concern. Blong
defines a set of `x-blong-*` extension fields that can be added to any
schema property:

| Extension        | Purpose                            | Example                                              |
| ---------------- | ---------------------------------- | ---------------------------------------------------- |
| `x-blong-widget` | Override the default widget        | `"x-blong-widget": "richtext"`                       |
| `x-blong-hidden` | Hide from default views            | `"x-blong-hidden": true`                             |
| `x-blong-order`  | Display order in forms/tables      | `"x-blong-order": 5`                                 |
| `x-blong-group`  | Group fields into sections         | `"x-blong-group": "address"`                         |
| `x-blong-column` | Table column configuration         | `"x-blong-column": {"width": 120, "sortable": true}` |
| `x-blong-lookup` | Populate dropdown from another API | `"x-blong-lookup": "currency.currency.find"`         |

These extensions are set in the TypeBox schema (using `x-blong-*` custom
keywords) and flow through to the OpenAPI document without any extra
configuration.

### 6. Interactive Design Editor (Improved)

The design editor from ut-prime is retained and improved:

- **Drag-and-drop** card rearrangement on a page grid
- **Field visibility** toggle per role
- **Widget type** selector with live preview
- **Validation rule** editor (min, max, pattern, custom)
- **Layout persistence** — saved to the server as JSON, keyed by
  page + role
- **Undo/redo** support
- **Diff view** — compare the customized layout against the default
  schema-derived layout

The editor is implemented as a Blong `component` layer that is only
active when the `design` configuration activation is present.

### 7. Component Patterns

Blong defines four standard component patterns (analogous to ut-prime's
Editor, Explorer, Inspector, Report):

| Pattern        | Description                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| **FormCard**   | A card wrapping a react-hook-form form generated from a request schema. Used for create/edit operations.        |
| **TableCard**  | A card wrapping a PrimeReact DataTable generated from a response array schema. Used for list/search operations. |
| **DetailCard** | A read-only card displaying a single entity.                                                                    |
| **ReportCard** | A card combining filters, a table and optional charts.                                                          |

Developers can use these patterns directly or let the component factory
create them automatically from the OpenAPI schema.

### 8. No Legacy Compatibility Burden

ut-prime had to co-exist with older UT modules that used different
patterns (Backbone, Angular, etc.). Blong has no such constraint. This
allows:

- A cleaner component API without adaptation layers
- Consistent use of ESM throughout
- No polyfills for older browsers (targeting evergreen browsers)
- Simpler handler signatures that match the server-side pattern

## Trade-offs

- **Runtime schema fetching** adds a network round-trip at startup. This
  is mitigated by caching and by bundling a schema snapshot for
  production builds.
- **Extension fields** (`x-blong-*`) are not part of the OpenAPI
  standard. They are valid per the specification's extension mechanism,
  but third-party tools may ignore them.
- **Generated UIs are generic**. Highly custom screens still need
  hand-written components. The goal is to cover the 80 % of CRUD screens
  automatically and provide escape hatches for the remaining 20 %.
