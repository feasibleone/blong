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

### Lessons Learned

While ut-prime and ut-model proved the concept, they were constrained by
the UT framework's legacy:

1. **Separate model layer**: Models were defined in a custom DSL-like
   JavaScript format, separate from both the API schema and the React
   components. This introduced a third source of truth alongside the
   TypeBox/OpenAPI schema and the handler types.

2. **Older React patterns**: ut-prime was built before React hooks
   matured. It relied on class components and a custom form state manager
   rather than react-hook-form.

3. **Older PrimeReact version**: The component mappings targeted an older
   PrimeReact API. Newer versions have improved accessibility,
   unstyled mode and design token support.

4. **Bundle size**: The build used Webpack with limited tree-shaking. All
   components were bundled even if unused.

5. **Runtime overhead**: Models were resolved at runtime through multiple
   layers of merging and indirection, making debugging harder.

6. **CI/CD**: Jenkins pipelines were used; GitHub Actions offer tighter
   integration with the source repository.

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

### 2. Modern React with Hooks

All generated components use functional React with hooks:

- **react-hook-form** manages form state, validation and submission.
  It is the de facto standard for form handling in React and provides
  excellent performance through uncontrolled components.
- **React Query (TanStack Query)** manages server state — caching,
  background refetching, optimistic updates and pagination.
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

| Extension | Purpose | Example |
|-----------|---------|---------|
| `x-blong-widget` | Override the default widget | `"x-blong-widget": "richtext"` |
| `x-blong-hidden` | Hide from default views | `"x-blong-hidden": true` |
| `x-blong-order` | Display order in forms/tables | `"x-blong-order": 5` |
| `x-blong-group` | Group fields into sections | `"x-blong-group": "address"` |
| `x-blong-column` | Table column configuration | `"x-blong-column": {"width": 120, "sortable": true}` |
| `x-blong-lookup` | Populate dropdown from another API | `"x-blong-lookup": "currency.currency.find"` |

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
- **Diff view** — compare the customised layout against the default
  schema-derived layout

The editor is implemented as a Blong `component` layer that is only
active when the `design` configuration activation is present.

### 7. Component Patterns

Blong defines four standard component patterns (analogous to ut-prime's
Editor, Explorer, Inspector, Report):

| Pattern | Description |
|---------|-------------|
| **FormCard** | A card wrapping a react-hook-form form generated from a request schema. Used for create/edit operations. |
| **TableCard** | A card wrapping a PrimeReact DataTable generated from a response array schema. Used for list/search operations. |
| **DetailCard** | A read-only card displaying a single entity. |
| **ReportCard** | A card combining filters, a table and optional charts. |

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
