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
For the implementation plan see
[Browser UI Implementation Plan](../../../../plans/ui-BLONG_UI_IMPLEMENTATION_PLAN.md).

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
The component factory maps JSON Schema types to PrimeReact components:

| JSON Schema type / format | PrimeReact component |
|---------------------------|---------------------|
| `string`                  | InputText           |
| `string` + `date-time`   | Calendar            |
| `string` + `enum`        | Dropdown            |
| `number` / `integer`     | InputNumber         |
| `boolean`                | Checkbox / ToggleButton |
| `string` + `text`        | InputTextarea       |
| `object`                 | Fieldset (recursive) |
| `array`                  | DataTable or repeatable Fieldset |

Developers can override any mapping via `x-blong-widget` in the schema
or via the interactive design editor.

## Pages, Cards and Layouts

The UI is composed of:

- **Page** — a routable top-level view. Pages are registered by
  component handlers using `React Router`.
- **Card** — a self-contained section within a page that focuses on one
  entity or action. Cards are the primary unit of composition. A card
  wraps a generated form, table or detail view and adds a header, toolbar
  and optional actions.
- **Layout** — configures how cards are arranged on a page (grid, tabs,
  split panes). Layouts are stored as JSON configuration that can be
  edited at design time.

## Interactive Design Editor

Blong retains and improves the interactive UI configuration capability
from ut-prime. A **design editor** overlay allows authorised users to:

- Rearrange cards on a page via drag-and-drop
- Show / hide individual fields or columns
- Change widget types (e.g. switch a string field from InputText to
  Dropdown)
- Configure validation rules beyond what the schema provides
- Save the layout configuration to the server, where it is persisted
  per user role or per user

The design editor is itself built as a Blong component layer and is only
activated in `dev` or `design` configuration environments.

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
