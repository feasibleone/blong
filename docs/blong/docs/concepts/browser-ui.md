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
        ├── adapter/mock      ← Auto-generated CRUD mocks (storybook/integration only)
        ├── orchestrator/auth ← Session management
        └── orchestrator/portal ← Tab/menu navigation + model page discovery
  └── marine realm            ← realm-specific pages
        ├── meta/model/       ← IModelSpec handlers (.model kind)
        ├── meta/fixture/     ← Fixture data handlers (.fixture kind)
        └── orchestrator/     ← Forwarding orchestrator (→ backend)
```

Application realms sit alongside blong-browser. They do not import blong-browser
code directly. Instead, they register page handlers via file-naming
conventions — model handlers (`.model` kind), component handlers (`.component` suffix),
portal configs (`.portal` suffix) — and the portal orchestrator discovers and wires
them automatically.

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

All widget configuration flows from `IEnrichedSchema` objects. In a model-driven page, the
schema is produced by merging the static `IModelSpec.schema` overlay with the result of the
`{subject}.{object}.schema` handler call (which returns runtime customisations or `{}`). In a
custom page, the realm fetches or constructs the schema directly and passes it to `Editor`,
`Explorer`, or `Report`.

Widget type, validation rules, labels, required markers, and layout hints are all derived from the
enriched schema properties without any per-field configuration at the component level.

This means:

- Adding a field on the server (and updating the schema overlay in the model) automatically adds
  it to the UI form
- Required constraints in the schema overlay drive browser-side validation
- Widget type hints (`widget.type`) select the correct PrimeReact input component

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
match several file-naming patterns:

- `.model` kind — model spec handlers (produced by the `model()` factory); auto-generate Browse/New/Open/Report pages
- `*.component` suffix — component handlers (return `{title, permission, component}`)
- `*.portal` suffix — portal menu configuration
- `*.actions` suffix — named action objects

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

Two Storybook setups exist:

**`core/blong-browser/.storybook/`** — Per-component stories for the blong-browser component
library (`Editor`, `Explorer`, `Form`, widgets, etc.). Uses the `withDispatch` decorator from
`.storybook/dispatch.tsx` with named mock handlers. Fixture data comes from
`@feasibleone/blong-marine/meta/storybook.js`. Best for developing and testing individual
components in isolation.

**`core/ui-demo/.storybook/`** — End-to-end model page stories using the `Model` component. Uses
`withBlong(browser)` from `@feasibleone/blong-browser/storybook.tsx` which loads the full blong
platform (including the mock adapter and marine realm). Stories use the `page()` helper from
`src/storyHelper.tsx`. Best for verifying complete CRUD flows for a realm. The canonical domain is
**marine biology** (corals, habitats, fish families, species).