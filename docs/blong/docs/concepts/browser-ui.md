# Browser UI

The browser platform extends the Blong framework to deliver rich,
metadata-driven user interfaces that run entirely in the web browser. It
reuses the same architectural building blocks — suites, realms, layers,
adapters, orchestrators and handlers — but adapts them to the constraints
and opportunities of the browser environment.

For the design rationale that explains *why* these choices were made see
[Metadata-Driven UI](../rationale/metadata-driven-ui.md).

For implementation patterns see
[Modular UI](../patterns/blong-browser.md).

---

## Where blong-browser Sits in the Architecture

`blong-browser` (`core/blong-browser/`) is a **blong realm** that provides the
shared UI infrastructure for all browser-side suites. It is not a
standalone UI library — it is a proper realm loaded into a suite's
browser entry point as a peer alongside application realms.

```
Suite (browser.ts)
  └── blong-browser realm          ← @feasibleone/blong-browser/browser.js
        ├── adapter/backend   ← HTTP/JSON-RPC to Blong server gateway
        ├── adapter/storage   ← Browser localStorage
        ├── orchestrator/auth ← Session management
        └── orchestrator/portal ← Tab/menu navigation shell
  └── marine realm            ← realm-specific pages
        ├── component/index   ← contributes page handlers
        └── orchestrator/…    ← realm business logic
```

Application realms sit alongside blong-browser. They do not import blong-browser
code directly. Instead, they register page handlers by file-naming
convention (`*.component`, `*.portal`, `*.actions`) and the portal
orchestrator discovers and wires them automatically through the handler
namespace.

---

## Layers in the Browser

The following layers have specific meaning in the browser platform:

| Layer          | Purpose                                                                         |
| -------------- | ------------------------------------------------------------------------------- |
| `backend`      | Adapter that communicates with the Blong server over JSON-RPC. Uses `fetch`.    |
| `storage`      | Adapter for browser local storage: token/permissions persistence.               |
| `auth`         | Orchestrator: login/logout/session lifecycle coordinating backend + storage.    |
| `portal`       | Orchestrator: tab navigation, menu resolution, dropdown proxy.                  |
| `component`    | Page handlers contributed by each realm — return title, permission, React component. |

---

## The Portal Shell

The portal is the top-level page frame. It renders a **Menubar** at the top
and a **TabView** of open pages. Realms contribute menu items and page
components without knowing about each other.

Each open tab is backed by a component handler identified by a semantic
triple (e.g. `marine.coral.browse`). Opening a tab calls the handler to
get `{title, permission, component}`, then renders the React component in
a new tab. The browser state (open tabs, active tab) is held in Zustand
and is local to the browser session.

---

## Schema-Driven Rendering

The server exposes per-subject OpenAPI documents at
`GET /rpc/{subject}/openapi.json`. The browser fetches and caches these
documents. The `schemaRegistry` enriches the raw OpenAPI schema with
widget resolution metadata, transforming JSON Schema property definitions
into fully typed `IEnrichedSchema` objects that components consume directly
to generate forms, tables and widgets.

This means:

- Adding a field on the server automatically adds it to the UI form
- Required constraints on the server type drive browser-side validation
- Enum values on the server type populate dropdown options

The browser-side `IModelSpec` overlay can supplement the server schema
with display hints (widget type, dropdown name, card groupings, filter
flags) that are purely presentational and need not appear on the server.

---

## Component Architecture

All UI state flows through a single root composition:
**App → BlongUiProvider → Theme → Portal**.

`BlongUiProvider` holds three shared resources:

1. **`dispatch`** — the blong handler proxy; all UI→backend calls go here
2. **`schemaRegistry`** — enriched schema map (per subject.object)
3. **TanStack QueryClient** — server state cache used inside the adapter layer

Components never call HTTP directly. They call `dispatch(method, params)`
and the portal/auth/backend orchestrators route the call appropriately.

### High-Level Components

| Component  | Role                                                           |
| ---------- | -------------------------------------------------------------- |
| `Editor`   | Form + toolbar + load/save lifecycle. Complex entity editing.  |
| `Explorer` | DataTable list view + toolbar + optional tree navigator.       |
| `Report`   | Filter form + summary metrics + read-only DataTable.           |
| `Form`     | react-hook-form wrapper with Card grid. Owned by Editor.       |
| `Card`     | Named group of widgets in a PrimeFlex grid column.             |
| `Portal`   | Menubar + TabView shell.                                       |
| `Login`    | Login form calling `auth.login`.                               |

For the full Editor feature documentation see
[Editor Features](editor-features.md).

---

## Micro-Frontend Integration

The portal orchestrator (`orchestrator/portal.ts`) imports handlers that
match three file-naming patterns:

- `*.component` — page handler (returns `{title, permission, component}`)
- `*.portal` — portal menu configuration
- `*.actions` — named action objects

Any realm that places files following these naming conventions
automatically participates in the portal without a direct dependency on
blong-browser. This is the primary mechanism for building multi-realm
browser-side suites.

---

## Model System

For common CRUD workflows, the **model system** (`src/model/`) provides a
higher-level abstraction: an `IModelSpec` declaration is sufficient to
generate Browse / New / Open / Report pages for an entity automatically.

See [Model System](blong-model.md) for the concept and
[Schema based UI](../patterns/blong-model.md) for usage.

---

## Storybook

Storybook (`core/blong-browser/.storybook/`) provides isolated development of
all components. Stories mock the dispatch function so components can be
developed and tested without a running Blong server. The canonical
example domain is **marine biology** (corals, habitats, fish families).
