# Blong Browser UI — Implementation Plan

## Overview

### Problem Statement

The Blong framework currently provides a mature server-side platform with
adapters, orchestrators, layers and handlers, plus a minimal browser
platform used primarily for API testing. There is no production-quality UI
framework for building browser-based applications that consume the server
APIs.

Enterprise applications built on Blong need rich user interfaces — forms,
tables, detail views, dashboards — for hundreds of entities. Building
these by hand for every endpoint is slow, error-prone and expensive.

### Solution

Extend the Blong browser platform to deliver **metadata-driven UI
generation**: the server's OpenAPI schemas (derived from TypeBox types)
are consumed by the browser at runtime to automatically produce forms,
tables and views. An interactive design editor lets non-developers
customise the generated UI per role.

The approach is inspired by
[ut-prime](https://github.com/softwaregroup-bg/ut-prime) and
[ut-model](https://github.com/softwaregroup-bg/ut-model) but modernised
for current React, PrimeReact, react-hook-form and Vite.

### Success Criteria

- A Blong suite can define a browser entry point that renders a full CRUD
  application by consuming the server's OpenAPI schema
- Forms are auto-generated from request schemas, tables from response
  array schemas
- An interactive design editor allows rearranging fields, hiding columns,
  changing widget types, and persisting layouts per role
- The browser platform reuses the same suite/realm/layer/handler concepts
  as the server
- Storybook stories exist for every core component
- Playwright tests cover the critical paths
- Chromatic runs visual regression in CI
- GitHub Actions workflows build, test and publish the browser assets
- Documentation covers concepts, rationale and patterns

### Reference Documents

- **Concept**: [Browser UI](../docs/blong/docs/concepts/browser-ui.md)
- **Rationale**: [Metadata-Driven UI](../docs/blong/docs/rationale/metadata-driven-ui.md)

---

## Technical Approach

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Browser (Vite)                                         │
│                                                         │
│  ┌──────────┐  ┌───────────────┐  ┌──────────────────┐ │
│  │ backend  │  │ orchestrator  │  │ component        │ │
│  │ (adapter)│──│ (browser biz  │──│ (React pages,    │ │
│  │          │  │  logic)       │  │  cards, widgets) │ │
│  └────┬─────┘  └───────────────┘  └───────┬──────────┘ │
│       │                                    │            │
│       │  JSON-RPC / REST                   │ renders    │
│       ▼                                    ▼            │
│  ┌──────────┐                    ┌──────────────────┐   │
│  │ ky/Fetch │                    │ PrimeReact +     │   │
│  │          │                    │ react-hook-form  │   │
│  └────┬─────┘                    └──────────────────┘   │
└───────┼─────────────────────────────────────────────────┘
        │ HTTP
        ▼
┌─────────────────────────┐
│  Server (Blong/Fastify) │
│  gateway → orchestrator │
│  → adapter → DB/APIs    │
└─────────────────────────┘
```

### Technology Choices

| Concern | Technology | Reason |
|---------|-----------|--------|
| UI components | PrimeReact (latest) | Rich component set, unstyled mode, design tokens, accessibility |
| Form state | react-hook-form | Performance, validation, uncontrolled components — same as ut-prime but with TypeBox resolver |
| Form validation | TypeBox / JSON Schema resolver | Same type system as server; replaces ut-prime's Joi resolver |
| Server state | TanStack Query (React Query) | Caching, refetching, pagination, optimistic updates — replaces ut-prime's per-component loading |
| Routing | React Router v7+ | URL state, code splitting, nested routes |
| Bundler | Vite | HMR, ESM, tree-shaking, fast builds |
| Testing: component | Storybook v8+ | Isolated component development, interaction tests |
| Testing: visual | Chromatic | Visual regression in CI |
| Testing: e2e | Playwright | Full-stack browser tests |
| CI/CD | GitHub Actions | Existing Blong workflows, matrix builds |
| Schema validation | TypeBox | Same as server — single type system |
| HTTP client | ky | Already used in GatewayClient, browser Fetch based |

### Package Structure

```
core/
├── blong-ui/                        # Core browser UI framework package
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── index.ts                 # Public API exports
│   │   ├── factory/                 # Schema → component factory
│   │   │   ├── FormFactory.tsx      # JSON Schema → react-hook-form
│   │   │   ├── FormSubmit.ts        # prepareSubmit, $original tracking
│   │   │   ├── TableFactory.tsx     # JSON Schema → DataTable
│   │   │   ├── DetailFactory.tsx    # JSON Schema → detail view
│   │   │   ├── WidgetMap.ts         # type/format → PrimeReact component
│   │   │   ├── FieldResolver.tsx    # Resolves x-blong-* extensions
│   │   │   ├── CardResolver.ts     # Schema → named card groups
│   │   │   └── LayoutResolver.ts   # Mode-keyed layout resolution
│   │   ├── components/              # Standard component patterns
│   │   │   ├── FormCard.tsx         # Editor (create/edit)
│   │   │   ├── TableCard.tsx        # Explorer (browse/search)
│   │   │   ├── DetailCard.tsx       # Inspector (read-only)
│   │   │   ├── ReportCard.tsx       # Report (filters + table)
│   │   │   ├── PageShell.tsx        # App shell with nav + breadcrumbs
│   │   │   └── ErrorBoundary.tsx
│   │   ├── design/                  # Interactive design editor
│   │   │   ├── DesignEditor.tsx     # Main editor overlay + toolbar
│   │   │   ├── ConfigCard.tsx       # Draggable card wrapper
│   │   │   ├── ConfigField.tsx      # Draggable field wrapper
│   │   │   ├── Inspector.tsx        # Property inspector panel
│   │   │   ├── SelectField.tsx      # Add-field dialog
│   │   │   ├── SelectCard.tsx       # Add-card dialog
│   │   │   └── DesignStore.ts       # Customisation state + persistence
│   │   ├── hooks/                   # Reusable hooks
│   │   │   ├── useSchema.ts         # Fetch + cache OpenAPI schema
│   │   │   ├── useApi.ts            # TanStack Query wrappers for JSON-RPC
│   │   │   ├── useDropdown.ts       # Auto-discover + batch-fetch dropdowns
│   │   │   ├── useCustomization.ts  # Load/merge customisations
│   │   │   ├── usePermissions.ts    # Permission checks from JWT
│   │   │   ├── useLayout.ts         # Layout state resolution
│   │   │   ├── useDesign.ts         # Design editor context
│   │   │   └── useTheme.ts          # PrimeReact theme tokens
│   │   ├── auth/                    # Authentication integration
│   │   │   ├── AuthProvider.tsx
│   │   │   ├── LoginForm.tsx
│   │   │   └── ProtectedRoute.tsx
│   │   └── types.ts                 # Schema, Cards, Layouts, Dropdowns,
│   │                                # Customisation, x-blong-* types
│   └── stories/                     # Storybook stories for core components
│       ├── FormCard.stories.tsx
│       ├── TableCard.stories.tsx
│       └── DesignEditor.stories.tsx
│
├── blong-ui-storybook/              # Storybook configuration package
│   ├── .storybook/
│   │   ├── main.ts
│   │   ├── preview.tsx
│   │   └── manager.ts
│   ├── package.json
│   └── tsconfig.json
│
└── blong/                           # Existing — extend types.ts
    └── types.ts                     # Add BrowserContext, x-blong-* types
```

### Key Design Decisions

1. **No separate model layer**: Unlike ut-model, there is no separate
   model definition format. The TypeBox schema IS the model. UI hints are
   added via `x-blong-*` extension fields in the schema. Cards and
   layouts are defined in component handlers or derived from schema
   metadata at runtime.

2. **TypeBox resolver instead of Joi**: ut-prime already uses
   react-hook-form with `@hookform/resolvers/joi`. Blong replaces the
   Joi resolver with a TypeBox / JSON Schema resolver, eliminating Joi
   as a dependency and keeping a single type system across server and
   browser.

3. **Component handlers follow the Blong pattern**: A browser component
   handler uses the same `handler()` / `library()` API as server
   handlers. The component factory is itself a library function available
   via `lib.componentFactory`.

4. **Vite replaces file-system scanning**: The server's `Watch` and
   `readdir` based discovery is replaced by Vite's static import
   resolution and HMR. Each layer's entry file explicitly imports its
   handlers.

5. **TanStack Query replaces custom data loading**: ut-prime loaded data
   per-component with custom `useLoad` hooks. TanStack Query provides
   battle-tested caching, deduplication and background refetching.

6. **Design editor as a layer**: The interactive editor is a `design`
   layer, activated only in `dev` or `design` environments. It is not
   bundled in production unless explicitly enabled.

7. **Cards/layouts composition model**: Blong adopts ut-prime's proven
   cards/layouts architecture — named card groups of widgets, mode-keyed
   layout definitions, tabbed navigation via ThumbIndex, conditional
   visibility via watch/match, and permission-gated cards. The model is
   derived from `x-blong-*` extensions or defined in component handlers.

8. **Trigger-based form submission**: The toolbar Save button is
   controlled by a `trigger` callback set when the form is dirty. The
   submit flow tracks `$original` values for reset, uses
   `prepareSubmit()` to strip internal fields, and automatically
   switches from create to edit mode after a successful add.

9. **Automatic dropdown discovery**: Dropdown field names are discovered
   from the active layout's cards. A single batch `onDropdown` call
   fetches all options, cached by TanStack Query.

10. **Customisation persistence**: Per-component customisations (schema,
    cards, layouts overrides) are persisted via
    `ui.customization.edit/get` and merged with defaults at runtime.

11. **Three widget categories**: Blong adopts ut-prime's proven widget
    taxonomy — scalar (primitive values), scalar array (multi-select from
    lists), vector array (editable tables with per-column widgets). This
    covers virtually all data-entry needs without custom code.

12. **Advanced composable patterns**: Cascaded dropdowns/tables,
    master-detail, static/dynamic pivot, and polymorphic layouts are
    first-class features. These patterns compose via `$` prefix internal
    form state (`$.selected.xxx`, `$.edit.xxx`) automatically excluded
    from submission.

13. **Custom widget escape hatch**: An `editors` property allows passing
    custom React components as widgets. Custom widgets receive `Input`,
    `Label`, `ErrorLabel` internal components and declare their
    properties via `.properties`. This covers the 20% of screens that
    need hand-written components.

14. **File upload via multipart**: Form properties serialized as JSON
    with name `$`; files serialized individually with path-based names.
    The same validation schema covers both JSON and file fields.

15. **Portal menu from handler metadata**: Portal menu is generated from
    component handler `title` and `permission` properties via
    `portalMenuItem()`, eliminating manual menu wiring.

---

## Implementation Plan

### Phase 1: Foundation (core/blong-ui scaffold)

Set up the package, build toolchain and core infrastructure.

| Task | Complexity | Dependencies |
|------|-----------|--------------|
| 1.1 Create `core/blong-ui` package with `package.json`, `tsconfig.json`, `vite.config.ts` | Small | — |
| 1.2 Register package in `rush.json` | Small | 1.1 |
| 1.3 Add PrimeReact, react-hook-form, TanStack Query, React Router dependencies | Small | 1.1 |
| 1.4 Create `src/types.ts` with shared browser UI types: `Schema`, `Cards`, `Layouts`, `Dropdowns`, `Customisation`, `x-blong-*` extension interfaces | Medium | 1.1 |
| 1.5 Extend `core/blong/types.ts` with `BrowserContext` additions (x-blong extensions, UI hint types) | Small | 1.4 |
| 1.6 Create `src/hooks/useSchema.ts` — fetch and cache the OpenAPI schema from the server gateway | Medium | 1.3 |
| 1.7 Create `src/hooks/useApi.ts` — TanStack Query wrapper for JSON-RPC calls via `ky` | Medium | 1.3 |
| 1.8 Create `src/hooks/useDropdown.ts` — automatic dropdown field discovery from cards/layout, batch fetch via `onDropdown`, TanStack Query caching | Medium | 1.7 |
| 1.9 Create `src/hooks/useCustomization.ts` — load/merge customisations (schema, cards, layouts) from `ui.customization.get`, expose `saveCustomization` via `ui.customization.edit` | Large | 1.7 |
| 1.10 Create `src/auth/AuthProvider.tsx` — JWT auth context using blong-login | Medium | 1.7 |
| 1.11 Create `src/auth/LoginForm.tsx` and `ProtectedRoute.tsx` | Medium | 1.10 |
| 1.12 Set up Storybook in `core/blong-ui-storybook` | Medium | 1.1 |
| 1.13 Add GitHub Actions workflow step for browser build + Storybook | Medium | 1.12 |

### Phase 2: Component Factory (schema → React)

The core value proposition: automatic component generation from OpenAPI schemas.
This phase also establishes the cards/layouts composition model and form
submission patterns derived from ut-prime's proven architecture.

| Task | Complexity | Dependencies |
|------|-----------|--------------|
| 2.1 Create `src/factory/WidgetMap.ts` — mapping from JSON Schema type/format to PrimeReact components. Three widget categories: **scalar** (input, password, text, mask, number, currency, integer, boolean, date, time, datetime, dropdown, dropdownTree, select), **scalar array** (multiSelect, multiSelectTree, selectTable, multiSelectPanel, multiSelectTreeTable), **vector array** (table with per-column widgets). See browser-ui.md for the full type→component tables | Large | Phase 1 |
| 2.2 Create `src/factory/FieldResolver.tsx` — resolve `x-blong-*` extensions to component props; handle `x-blong-widget` overrides, `x-blong-hidden`, `x-blong-order`, `x-blong-group` | Medium | 2.1 |
| 2.3 Create `src/factory/CardResolver.ts` — resolve cards from schema properties. Each card has `widgets` (field name array), `label`, `className`, `hidden`, `watch`/`match` (conditional visibility), `permission`. Support nested arrays in `widgets` for sub-grouping | Medium | 2.2 |
| 2.4 Create `src/factory/LayoutResolver.ts` — resolve layouts from `x-blong-layout` or handler config. Support mode-keyed layouts (`editDefault`, `createFoo`), tabbed layouts with `items`/`orientation`, fallback from create→edit layout. Integrate `ThumbIndex` tab navigation for tabbed layouts | Large | 2.3 |
| 2.5 Create `src/factory/FormFactory.tsx` — generate a react-hook-form form from a request JSON Schema with TypeBox resolver (replacing ut-prime's Joi resolver). Wire `FormProvider`, `handleSubmit`, `formState`. Implement trigger pattern: `setTrigger(submitFn)` when dirty, `setTrigger(undefined)` when clean. Maintain internal `$` prefix state (`$.edit.xxx`, `$.selected.xxx`) excluded from submit. Display skeleton placeholders during data loading | Large | 2.1, 2.2, 2.3, 2.4 |
| 2.6 Create `src/factory/FormSubmit.ts` — `prepareSubmit()` to strip `$original`/`$modified` and `$.*` internal state fields before API call. Handle create vs edit mode switching. Merge server response with form data on success | Medium | 2.5 |
| 2.7 Create `src/factory/TableFactory.tsx` — generate a PrimeReact DataTable from a response array schema. Wire column headers from `title`, formatters from type, sorting/filtering from `x-blong-column`. Support `selectionMode` (single/multiple) for row selection. Maintain `$.selected.xxx` in form state for selected row | Large | 2.1, 2.2 |
| 2.8 Create `src/factory/DetailFactory.tsx` — generate a read-only detail view from a response schema | Medium | 2.1, 2.2 |
| 2.9 Handle nested objects (Fieldset) and arrays (useFieldArray / repeatable sections) | Large | 2.5 |
| 2.10 Implement lookup field support (`x-blong-lookup` → discovered by `useDropdown`, fetched via batch `onDropdown` call). Support cascaded dropdowns via `parent` property — child dropdown filters options based on parent field value. Dropdown data includes `parent` field for hierarchical filtering | Large | 2.5, 1.8 |
| 2.11 Implement custom widgets — an `editors` property on FormCard/Editor allows passing custom React components as widgets. Each receives `Input`, `Label`, `ErrorLabel` internal components as props. Custom widgets declare managed properties via `.properties` array and are referenced by name in card `widgets` | Medium | 2.5 |
| 2.12 Storybook stories for FormFactory, TableFactory, DetailFactory with mock schemas | Medium | 2.5, 2.7, 2.8 |

### Phase 3: Standard Component Patterns

Higher-level components that combine the factories into usable UI patterns.

| Task | Complexity | Dependencies |
|------|-----------|--------------|
| 3.1 Create `src/components/FormCard.tsx` — card wrapping FormFactory with toolbar (Save, Cancel, Reset). Save uses trigger pattern; Reset restores `$original` values; toolbar state driven by `formState.isDirty` | Medium | Phase 2 |
| 3.2 Create `src/components/TableCard.tsx` — card wrapping TableFactory with search, filters, pagination, row actions. Wire `fetch` method with `orderBy`/`paging` params (matching ut-model's `browser.fetch` contract), `resultSet` extraction, `pagination.recordsTotal` for page count | Large | Phase 2 |
| 3.3 Create `src/components/DetailCard.tsx` — read-only entity card | Small | Phase 2 |
| 3.4 Create `src/components/ReportCard.tsx` — filters + table + optional charts | Medium | 3.2 |
| 3.5 Create `src/components/PageShell.tsx` — app shell with sidebar nav, breadcrumbs, header | Medium | Phase 1 |
| 3.6 Create `src/components/ErrorBoundary.tsx` — error boundary with typed Blong error display. Handle `validation` array errors from JSON-RPC responses (set field-level errors via `setError`) | Medium | Phase 1 |
| 3.7 Integrate React Router — auto-generate routes from discovered page handlers | Medium | 3.5 |
| 3.8 Permission-based rendering — conditionally show/hide cards and actions based on JWT permissions. Cards with `permission` prop are gated via `usePermissionCheck()` | Medium | 1.10 |
| 3.9 Conditional card visibility — implement `watch`/`match` pattern: cards with `watch` prop observe a form field, `match` object comparison determines visibility | Medium | 3.1, Phase 2 |
| 3.10 Cascaded tables — implement `master`/`parent` properties for parent-child table filtering. Child table filters rows based on `$.selected.xxx` from parent table. Support `hidden` columns for relational fields needed by the cascade | Large | 3.2, Phase 2 |
| 3.11 Master-detail — detail card with `watch: '$.selected.xxx'` edits the selected table row. Edit widgets reference `$.edit.xxx.propertyName`. Changes update the row in the parent array | Large | 3.9, 3.10 |
| 3.12 Static and dynamic pivot — pre-populate table with static data (`pivot.examples` + `pivot.join`) or dynamic dropdown data (`pivot.dropdown` + `pivot.join`). Merge pivot rows with data array | Large | 3.2, Phase 2 |
| 3.13 Polymorphic layout — `typeField` property selects layout by data type value. Look up `edit{TypeValue}`/`create{TypeValue}` layout or card. Combine with polymorphic master-detail via `watch`/`match` on detail cards | Medium | 3.9, Phase 2 |
| 3.14 Portal menu configuration — implement `portal.params.get` handler pattern returning `{theme, portalName, menu}`. Menu items from `portalMenuItem(component$xxx)`. Page handlers follow naming convention: `.browse` (collection), `.new` (create), `.open` (edit with `{id}` prop) | Medium | 3.7 |
| 3.15 File upload support — switch from `application/json` to `multipart/form-data` for methods with file fields. Serialize regular properties as JSON with name `$`; file properties individually with path-based names. `x-blong-widget: file` for file input widgets | Large | 3.1, Phase 2 |
| 3.16 Storybook stories for all standard patterns, including mocked API helper: `app()` creates mock context with mocked API responses, `page()` creates individual story exports for each page component | Medium | 3.1–3.6 |

### Phase 4: Interactive Design Editor

The design-time editing capability, modelled on ut-prime's `useCustomization`,
`ConfigCard`, `ConfigField` and `Inspector` components.

| Task | Complexity | Dependencies |
|------|-----------|--------------|
| 4.1 Create `src/design/DesignStore.ts` — manages local customisation state (`{schema, card, layout}` sections). Load from `ui.customization.get` on startup. Provides `setCustomization` for live editing. Save via `ui.customization.edit` | Medium | 1.9 |
| 4.2 Create `src/design/ConfigCard.tsx` — draggable card wrapper. Supports drag source (card), drop target (card slot), and drop into trash. Cards show add/remove indicators in design mode | Large | 4.1 |
| 4.3 Create `src/design/ConfigField.tsx` — draggable field wrapper. Supports drag between cards, drag from "add field" palette, and drop into trash. Shows field name in design mode | Large | 4.1 |
| 4.4 Create `src/design/Inspector.tsx` — property inspector panel for the selected field or card. Edit field properties (title, widget type, validation rules, hidden). Edit card properties (label, className, permission). Changes update local customisation state immediately | Large | 4.1, Phase 2 |
| 4.5 Create `src/design/SelectField.tsx` — dialog for adding a new field (from schema properties not yet in any card) to a card slot | Medium | 4.1 |
| 4.6 Create `src/design/SelectCard.tsx` — dialog for adding a new card (from defined cards not yet in the layout) to a layout slot | Medium | 4.1 |
| 4.7 Create `src/design/DesignEditor.tsx` — overlay that activates design mode: toggle button (⚙), toolbar with save/add card/add field actions, trash zone, inspector panel. Integrates ConfigCard, ConfigField, Inspector | Large | 4.2, 4.3, 4.4, 4.5, 4.6 |
| 4.8 Undo/redo support in DesignStore | Medium | 4.1 |
| 4.9 Diff view — compare customised vs default layout | Medium | 4.1 |
| 4.10 Server-side handlers for persisting layout configs: `ui.customization.get({componentId})` and `ui.customization.edit({component: {componentId, componentConfig}})` | Medium | 4.1 |
| 4.11 Storybook stories for the design editor | Medium | 4.7 |

### Phase 5: Integration and Testing

Wire everything together, add e2e tests, and ensure CI works.

| Task | Complexity | Dependencies |
|------|-----------|--------------|
| 5.1 Create a reference suite (`core/ui-demo`) with server + browser entry points | Medium | Phases 1–4 |
| 5.2 Implement example realm with CRUD for a sample entity (auto-generated UI) | Medium | 5.1 |
| 5.3 Playwright test suite for the reference application. Use `data-testid` and `input[name]` as stable locators. Capture screenshots with `toMatchSnapshot()`. Auto-generate unique test users for parallel execution. Enable tracing on retry for failure diagnostics (timeline, network, console, DOM). Use `npx playwright codegen` for script recording | Large | 5.1, 5.2 |
| 5.4 Chromatic integration in GitHub Actions — publish Storybook on every build, visual diff comparison, approve/deny workflow for detected changes, host Storybook as online documentation | Medium | 1.12 |
| 5.5 Production build pipeline — Vite build → static assets served by Blong gateway | Medium | 5.1 |
| 5.6 GitHub Actions workflow: build browser, run Storybook tests, run Playwright, run Chromatic | Large | 5.3, 5.4, 5.5 |
| 5.7 Documentation: update patterns/suite.md with browser UI patterns | Small | 5.2 |
| 5.8 Documentation: add patterns/browser-ui.md with component handler patterns | Medium | 5.2 |

### Phase 6: Polish and Advanced Features

| Task | Complexity | Dependencies |
|------|-----------|--------------|
| 6.1 Theme support — PrimeReact design tokens, dark/light mode | Medium | Phase 3 |
| 6.2 Internationalisation (i18n) — label translation, RTL support | Large | Phase 3 |
| 6.3 Offline support — service worker, cache-first for static assets | Medium | Phase 5 |
| 6.4 Performance optimisation — lazy loading, virtualised tables, skeleton screens | Medium | Phase 3 |
| 6.5 Accessibility audit — WCAG 2.1 AA compliance | Medium | Phase 3 |
| 6.6 PWA manifest and icons | Small | 6.3 |

---

## Considerations

### Assumptions

- The server gateway already exposes `/documentation/json` with the full
  OpenAPI schema (confirmed: Fastify Swagger is configured)
- TypeBox schemas already generate valid JSON Schema with `title`,
  `description`, and constraints — these are used as-is for UI metadata
- PrimeReact's unstyled mode is stable and production-ready in the
  current release
- react-hook-form v7+ is the target version
- Vite v6+ is the target version
- React 19+ is the target version

### Constraints

- **No server-side rendering (SSR)** in Phase 1. The browser platform is
  a pure SPA. SSR can be added later via Vite's SSR plugin.
- **No Redux / Zustand / MobX** — state management uses react-hook-form +
  TanStack Query + React Context only. This is a deliberate simplicity
  constraint.
- **Evergreen browsers only** — no IE11 or legacy Edge support.
- **ESM only** — no CommonJS in the browser bundle.

### Risks

| Risk | Mitigation |
|------|-----------|
| PrimeReact API changes between versions | Pin exact version, wrap in abstraction layer |
| OpenAPI schema too large for initial fetch | Lazy-load schemas per namespace; cache aggressively |
| Complex nested schemas generate poor UIs | Provide escape hatches: custom component handlers override factory output |
| Design editor complexity exceeds estimate | Ship editor as a separate phase; core generation works without it |
| react-hook-form performance with very large forms (100+ fields) | Use `shouldUnregister`, field-level validation, virtualized field groups |

---

## Not Included (Future Versions)

- **Server-side rendering (SSR)** — can be added via Vite SSR plugin
- **Mobile platform** (React Native) — separate effort
- **Desktop platform** (Electron / Tauri) — separate effort
- **Real-time updates** (WebSocket push) — server-initiated UI updates
- **Dashboard builder** — drag-and-drop chart/widget composition
- **Code generation CLI** — generate component handler boilerplate from
  OpenAPI specs (a build-time alternative to runtime generation)
- **Multi-tenancy theming** — per-tenant branding and colour schemes
- **Plugin marketplace** — third-party component packages
