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
| Form state | react-hook-form | Performance, validation, uncontrolled components, TypeBox integration |
| Server state | TanStack Query (React Query) | Caching, refetching, pagination, optimistic updates |
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
│   │   │   ├── TableFactory.tsx     # JSON Schema → DataTable
│   │   │   ├── DetailFactory.tsx    # JSON Schema → detail view
│   │   │   ├── WidgetMap.ts         # type/format → PrimeReact component
│   │   │   └── FieldResolver.tsx    # Resolves x-blong-* extensions
│   │   ├── components/              # Standard component patterns
│   │   │   ├── FormCard.tsx
│   │   │   ├── TableCard.tsx
│   │   │   ├── DetailCard.tsx
│   │   │   ├── ReportCard.tsx
│   │   │   ├── PageShell.tsx        # App shell with nav + breadcrumbs
│   │   │   └── ErrorBoundary.tsx
│   │   ├── design/                  # Interactive design editor
│   │   │   ├── DesignEditor.tsx
│   │   │   ├── FieldConfigurator.tsx
│   │   │   ├── LayoutGrid.tsx
│   │   │   └── DesignStore.ts       # Persist/load layout config
│   │   ├── hooks/                   # Reusable hooks
│   │   │   ├── useSchema.ts         # Fetch + cache OpenAPI schema
│   │   │   ├── useApi.ts            # TanStack Query wrappers for JSON-RPC
│   │   │   ├── usePermissions.ts    # Permission checks from JWT
│   │   │   ├── useDesign.ts         # Design editor context
│   │   │   └── useTheme.ts          # PrimeReact theme tokens
│   │   ├── auth/                    # Authentication integration
│   │   │   ├── AuthProvider.tsx
│   │   │   ├── LoginForm.tsx
│   │   │   └── ProtectedRoute.tsx
│   │   └── types.ts                 # Shared TypeScript types
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
   added via `x-blong-*` extension fields in the schema.

2. **Component handlers follow the Blong pattern**: A browser component
   handler uses the same `handler()` / `library()` API as server
   handlers. The component factory is itself a library function available
   via `lib.componentFactory`.

3. **Vite replaces file-system scanning**: The server's `Watch` and
   `readdir` based discovery is replaced by Vite's static import
   resolution and HMR. Each layer's entry file explicitly imports its
   handlers.

4. **TanStack Query replaces custom caching**: ut-prime had custom
   caching logic. TanStack Query provides battle-tested caching,
   deduplication and background refetching.

5. **Design editor as a layer**: The interactive editor is a `design`
   layer, activated only in `dev` or `design` environments. It is not
   bundled in production unless explicitly enabled.

---

## Implementation Plan

### Phase 1: Foundation (core/blong-ui scaffold)

Set up the package, build toolchain and core infrastructure.

| Task | Complexity | Dependencies |
|------|-----------|--------------|
| 1.1 Create `core/blong-ui` package with `package.json`, `tsconfig.json`, `vite.config.ts` | Small | — |
| 1.2 Register package in `rush.json` | Small | 1.1 |
| 1.3 Add PrimeReact, react-hook-form, TanStack Query, React Router dependencies | Small | 1.1 |
| 1.4 Create `src/types.ts` with shared browser UI types and `x-blong-*` extension interfaces | Small | 1.1 |
| 1.5 Extend `core/blong/types.ts` with `BrowserContext` additions (x-blong extensions, UI hint types) | Small | 1.4 |
| 1.6 Create `src/hooks/useSchema.ts` — fetch and cache the OpenAPI schema from the server gateway | Medium | 1.3 |
| 1.7 Create `src/hooks/useApi.ts` — TanStack Query wrapper for JSON-RPC calls via `ky` | Medium | 1.3 |
| 1.8 Create `src/auth/AuthProvider.tsx` — JWT auth context using blong-login | Medium | 1.7 |
| 1.9 Create `src/auth/LoginForm.tsx` and `ProtectedRoute.tsx` | Medium | 1.8 |
| 1.10 Set up Storybook in `core/blong-ui-storybook` | Medium | 1.1 |
| 1.11 Add GitHub Actions workflow step for browser build + Storybook | Medium | 1.10 |

### Phase 2: Component Factory (schema → React)

The core value proposition: automatic component generation from OpenAPI schemas.

| Task | Complexity | Dependencies |
|------|-----------|--------------|
| 2.1 Create `src/factory/WidgetMap.ts` — mapping from JSON Schema type/format to PrimeReact components | Medium | Phase 1 |
| 2.2 Create `src/factory/FieldResolver.tsx` — resolve `x-blong-*` extensions to component props | Medium | 2.1 |
| 2.3 Create `src/factory/FormFactory.tsx` — generate a react-hook-form form from a request JSON Schema | Large | 2.1, 2.2 |
| 2.4 Create `src/factory/TableFactory.tsx` — generate a PrimeReact DataTable from a response array schema | Large | 2.1, 2.2 |
| 2.5 Create `src/factory/DetailFactory.tsx` — generate a read-only detail view from a response schema | Medium | 2.1, 2.2 |
| 2.6 Handle nested objects (Fieldset) and arrays (useFieldArray / repeatable sections) | Large | 2.3 |
| 2.7 Implement lookup field support (`x-blong-lookup` → fetch options from another API) | Medium | 2.3, 1.7 |
| 2.8 Storybook stories for FormFactory, TableFactory, DetailFactory with mock schemas | Medium | 2.3, 2.4, 2.5 |

### Phase 3: Standard Component Patterns

Higher-level components that combine the factories into usable UI patterns.

| Task | Complexity | Dependencies |
|------|-----------|--------------|
| 3.1 Create `src/components/FormCard.tsx` — card wrapping FormFactory with toolbar (Save, Cancel, Reset) | Medium | Phase 2 |
| 3.2 Create `src/components/TableCard.tsx` — card wrapping TableFactory with search, filters, pagination, row actions | Large | Phase 2 |
| 3.3 Create `src/components/DetailCard.tsx` — read-only entity card | Small | Phase 2 |
| 3.4 Create `src/components/ReportCard.tsx` — filters + table + optional charts | Medium | 3.2 |
| 3.5 Create `src/components/PageShell.tsx` — app shell with sidebar nav, breadcrumbs, header | Medium | Phase 1 |
| 3.6 Create `src/components/ErrorBoundary.tsx` — error boundary with typed Blong error display | Small | Phase 1 |
| 3.7 Integrate React Router — auto-generate routes from discovered page handlers | Medium | 3.5 |
| 3.8 Permission-based rendering — conditionally show/hide actions based on JWT permissions | Medium | 1.8 |
| 3.9 Storybook stories for all standard patterns | Medium | 3.1–3.6 |

### Phase 4: Interactive Design Editor

The design-time editing capability.

| Task | Complexity | Dependencies |
|------|-----------|--------------|
| 4.1 Create `src/design/DesignStore.ts` — load/save layout configurations from/to the server | Medium | Phase 1 |
| 4.2 Create `src/design/LayoutGrid.tsx` — drag-and-drop card arrangement | Large | 4.1 |
| 4.3 Create `src/design/FieldConfigurator.tsx` — show/hide fields, change widget types, set validation | Large | 4.1, Phase 2 |
| 4.4 Create `src/design/DesignEditor.tsx` — overlay that activates the editor mode | Medium | 4.2, 4.3 |
| 4.5 Undo/redo support in DesignStore | Medium | 4.1 |
| 4.6 Diff view — compare customised vs default layout | Medium | 4.1 |
| 4.7 Server-side handler for persisting layout configs (`ui.layout.edit`, `ui.layout.get`) | Medium | 4.1 |
| 4.8 Storybook stories for the design editor | Medium | 4.4 |

### Phase 5: Integration and Testing

Wire everything together, add e2e tests, and ensure CI works.

| Task | Complexity | Dependencies |
|------|-----------|--------------|
| 5.1 Create a reference suite (`dev/ui-demo`) with server + browser entry points | Medium | Phases 1–4 |
| 5.2 Implement example realm with CRUD for a sample entity (auto-generated UI) | Medium | 5.1 |
| 5.3 Playwright test suite for the reference application | Large | 5.1, 5.2 |
| 5.4 Chromatic integration in GitHub Actions | Medium | 1.10 |
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
