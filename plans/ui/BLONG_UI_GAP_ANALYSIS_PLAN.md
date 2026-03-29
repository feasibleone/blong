# Blong UI — Gap Analysis & Implementation Plan

## Overview

### Problem Statement

The `@feasibleone/blong-ui` package implements the core metadata-driven
UI framework with components, factories, hooks, auth, and design editor.
However, comparing it against the reference implementations
([ut-prime](https://github.com/softwaregroup-bg/ut-prime) and
[ut-model](https://github.com/softwaregroup-bg/ut-model)) reveals gaps
in testing infrastructure, documentation, theming, and the reference
demo application.

### Reference Implementation Comparison

**ut-prime** provides:
- Per-component Storybook stories for every component
- Per-component snapshot tests (`.snap` files via `toMatchSnapshot()`)
- Per-component README.mdx documentation consumed by Storybook as docs pages
- 4 built-in themes plus support for all PrimeReact themes
- Comprehensive interaction tests within stories (`play()` functions)
- Portal-level stories (`portal/index.stories.js`) covering full application flows

**ut-model** provides:
- `portal/index.stories.js` with comprehensive stories for high-level portal features
- Full CRUD workflow stories exercising the metadata-driven UI end-to-end

### Current State of blong-ui

**What exists:**
- 19 component files in `src/components/`
- 11 factory files in `src/factory/`
- 7 hook files in `src/hooks/`
- 3 auth files in `src/auth/`
- 7 design editor files in `src/design/`
- Storybook v10 configured in `.storybook/` with `@storybook/react-vite`
- 4 story files: `FormCard.stories.tsx`, `TableFactory.stories.tsx`,
  `DesignEditor.stories.tsx`, `AdvancedPatterns.stories.tsx`
- Chromatic integration configured (`ci-chromatic` script)
- `@storybook/test-runner` + `jest-image-snapshot` in devDependencies
- `visual:update` script for snapshot updates

**What is missing:**
1. Stories for most components (only 4 of ~40 exportable units have stories)
2. No snapshot tests (`.snap` files) despite tooling being configured
3. No interaction tests (`play()` functions) in any existing story
4. No per-component README.mdx documentation files
5. ThemeProvider only supports light/dark/system toggle — no PrimeReact
   theme selection (e.g., Lara, Aura, Nora, Material, etc.)
6. No portal-level comprehensive stories (equivalent to ut-model's
   `portal/index.stories.js`)
7. `dev/ui-demo` is referenced in `.gitignore` and `rush.json` memory
   but does not exist in the repository — the reference demo suite is
   missing
8. No Storybook `preview.tsx` decorator for PrimeReact theme wrapping
9. The `blong-ui-storybook` separate package mentioned in the original plan
   was not created (Storybook lives directly in `blong-ui`, which is fine)

### Success Criteria

- Every exported component, factory, and hook has at least one Storybook
  story with a `play()` interaction test
- Every story has a corresponding visual regression snapshot
- Every component has a README.mdx providing documentation rendered by
  Storybook
- ThemeProvider supports switching between multiple PrimeReact themes
  (not just light/dark)
- A Storybook theme toolbar decorator lets reviewers preview stories in
  different PrimeReact themes
- A portal-level story demonstrates a complete CRUD application flow
- `dev/ui-demo` exists as a reference suite with server + browser entry
  points, Storybook, and snapshot tests

---

## Gap 1: Missing Stories for Components

### Current Coverage

| Category | Files | Stories |
|----------|-------|---------|
| Components (19 files) | FormCard, TableCard, DetailCard, ReportCard, PageShell, ErrorBoundary, RouteGenerator, PermissionGate, ConditionalCard, CascadedTable, MasterDetail, PivotTable, PolymorphicLayout, PortalMenu, FileUpload, ThemeProvider, I18nProvider, Performance, Accessibility | FormCard ✓, (TableFactory story covers TableCard indirectly) |
| Factory (11 files) | WidgetMap, FieldResolver, CardResolver, LayoutResolver, FormFactory, FormSubmit, TableFactory, DetailFactory, NestedFields, CascadedDropdown, CustomWidgetRenderer | TableFactory ✓ |
| Design (7 files) | DesignEditor, ConfigCard, ConfigField, Inspector, SelectField, SelectCard, DesignStore | DesignEditor ✓ |
| Hooks (7 files) | useSchema, useApi, useDropdown, useCustomization, usePermissions, useLayout, useDesign, useTheme | — |
| Auth (3 files) | AuthProvider, LoginForm, ProtectedRoute | — |
| Advanced Patterns | MasterDetail, PivotTable, ConditionalCard, PermissionGate (in AdvancedPatterns.stories.tsx) | MasterDetail ✓, PivotTable (static only) ✓ |

### Tasks

Stories should be placed in `core/blong-ui/stories/` following the existing pattern.
Each story file must have at least one `Default` story and should cover
the key visual states (empty, loading, error, populated).

| Task | Scope | Notes |
|------|-------|-------|
| 1.1 `DetailCard.stories.tsx` | Components | Default, Loading, WithCards states |
| 1.2 `ReportCard.stories.tsx` | Components | Default with filters, NoFilters variant |
| 1.3 `PageShell.stories.tsx` | Components | WithMenu, CollapsedSidebar, WithBreadcrumbs |
| 1.4 `ErrorBoundary.stories.tsx` | Components | ChildError, RpcErrorDisplay, ValidationErrors |
| 1.5 `RouteGenerator.stories.tsx` | Components | Requires MemoryRouter decorator; BrowseNewOpen pages |
| 1.6 `PermissionGate.stories.tsx` | Components | Allowed, Denied, NoPermission states |
| 1.7 `ConditionalCard.stories.tsx` | Components | Visible, Hidden, MatchChanges states; wrap in FormProvider |
| 1.8 `CascadedTable.stories.tsx` | Components | ParentChildFilter, NoParent selection |
| 1.9 `PortalMenu.stories.tsx` | Components | Loaded, Loading, NestedItems, PermissionFiltered |
| 1.10 `FileUpload.stories.tsx` | Components | SingleFile, MultiFile, WithPreview |
| 1.11 `ThemeProvider.stories.tsx` | Components | LightMode, DarkMode, SystemMode, ThemeToggle |
| 1.12 `I18nProvider.stories.tsx` | Components | English, RTL, WithTranslations |
| 1.13 `Performance.stories.tsx` | Components | LazyPage, SkeletonField, SkeletonCard, SkeletonTable, PageSkeleton |
| 1.14 `Accessibility.stories.tsx` | Components | VisuallyHidden, SkipLink, LiveRegion, FocusTrap |
| 1.15 `WidgetMap.stories.tsx` | Factory | Render each scalar widget type (input, number, boolean, date, dropdown, etc.) |
| 1.16 `FieldResolver.stories.tsx` | Factory | Render resolved fields with various x-blong-* extensions |
| 1.17 `CardResolver.stories.tsx` | Factory | Display derived cards from schema, permission filtering |
| 1.18 `LayoutResolver.stories.tsx` | Factory | Default layout, tabbed layout, mode-keyed layouts |
| 1.19 `FormFactory.stories.tsx` | Factory | Separate from FormCard; basic form, nested objects, field arrays |
| 1.20 `FormSubmit.stories.tsx` | Factory | Demonstrate prepareSubmit, $original tracking, mode switching |
| 1.21 `DetailFactory.stories.tsx` | Factory | Read-only detail view from schema |
| 1.22 `NestedFields.stories.tsx` | Factory | NestedFieldset, ArrayFields with add/remove |
| 1.23 `CascadedDropdown.stories.tsx` | Factory | Parent-child filtering, independent dropdown |
| 1.24 `CustomWidgetRenderer.stories.tsx` | Factory | Custom widget with Input/Label/ErrorLabel props |
| 1.25 `LoginForm.stories.tsx` | Auth | Default, Submitting, Error states |
| 1.26 `AuthProvider.stories.tsx` | Auth | Authenticated, Unauthenticated, TokenExpired |
| 1.27 `ProtectedRoute.stories.tsx` | Auth | Allowed, RedirectToLogin |
| 1.28 `ConfigCard.stories.tsx` | Design | DesignMode card with drag indicators |
| 1.29 `ConfigField.stories.tsx` | Design | Draggable field in design mode |
| 1.30 `Inspector.stories.tsx` | Design | FieldSelected, CardSelected property panels |
| 1.31 `SelectField.stories.tsx` | Design | Add-field dialog |
| 1.32 `SelectCard.stories.tsx` | Design | Add-card dialog |
| 1.33 `PolymorphicLayout.stories.tsx` | Patterns | TypeField switching layouts, create vs edit |
| 1.34 `CascadedTable.stories.tsx` (extended) | Patterns | Master→Child with selection + detail form |

---

## Gap 2: No Interaction Tests (play functions)

### Current State

None of the 4 existing story files contain `play()` functions.
The `@storybook/test-runner` and `@testing-library/dom` packages are
already in devDependencies, so the infrastructure is ready.

### Tasks

Add `play()` functions to every story that has interactive elements.
The `play()` functions should use `@storybook/test` utilities
(`within`, `userEvent`, `expect`, `waitFor`) from Storybook v10.

| Task | Scope | Notes |
|------|-------|-------|
| 2.1 Add `play()` to `FormCard.stories.tsx` | Existing | Fill fields, click Save, verify trigger, test Cancel |
| 2.2 Add `play()` to `TableFactory.stories.tsx` | Existing | Click row selection, verify selection state, test pagination |
| 2.3 Add `play()` to `DesignEditor.stories.tsx` | Existing | Toggle design mode, select field, verify inspector |
| 2.4 Add `play()` to `AdvancedPatterns.stories.tsx` | Existing | MasterDetail: select row → verify detail form populates |
| 2.5 Add `play()` to all new stories from Gap 1 | New | Each interactive story gets a `play()` covering the primary user flow |

Interaction test patterns per component type:
- **Form components**: fill inputs → verify dirty state → submit → verify result
- **Table components**: click row → verify selection callback
- **Design components**: activate design mode → drag/click → verify inspector
- **Auth components**: enter credentials → submit → verify auth state
- **Portal/navigation**: click menu item → verify navigation callback

---

## Gap 3: No Visual Regression Snapshots

### Current State

`jest-image-snapshot` is in devDependencies and a `visual:update` script
exists, but no `.snap` files or `__snapshots__` directories exist.

### Tasks

| Task | Scope | Notes |
|------|-------|-------|
| 3.1 Configure snapshot test runner | Infrastructure | Ensure `test-storybook` config in `.storybook/` generates image snapshots via `jest-image-snapshot`. Add `postRender` hook in `.storybook/test-runner.ts` that calls `toMatchImageSnapshot()` |
| 3.2 Generate baseline snapshots | Baseline | Run `npm run visual:update` to create initial `.snap` files for all stories |
| 3.3 Add CI step for snapshot comparison | CI | Add `storybook:test:ci` to the GitHub Actions workflow. Fail on snapshot differences |
| 3.4 Document snapshot workflow | Docs | README instructions for updating snapshots after intentional visual changes |

---

## Gap 4: No Per-Component README.mdx Documentation

### Current State

No `.mdx` files exist anywhere in `core/blong-ui`. In ut-prime, every
component folder has a `README.mdx` that Storybook renders as a
documentation page. This provides:
- Component purpose and description
- Props table (auto-generated from TypeScript types)
- Usage examples with live code
- Design guidelines

### Approach

Storybook v10 with `@storybook/addon-docs` (already installed) supports
MDX documentation pages. Each component should have a co-located
`README.mdx` or a docs page referenced from the story meta via
`parameters.docs.page`.

The Storybook `main.ts` already includes `../src/**/*.stories.@(ts|tsx)`
glob — extend it to also pick up `../src/**/*.mdx` files.

### Tasks

| Task | Scope | Notes |
|------|-------|-------|
| 4.1 Update `.storybook/main.ts` | Infrastructure | Add `'../src/**/*.mdx'` to the `stories` array |
| 4.2 Create `src/components/FormCard.mdx` | Components | Description, props, usage, design notes |
| 4.3 Create `src/components/TableCard.mdx` | Components | |
| 4.4 Create `src/components/DetailCard.mdx` | Components | |
| 4.5 Create `src/components/ReportCard.mdx` | Components | |
| 4.6 Create `src/components/PageShell.mdx` | Components | |
| 4.7 Create `src/components/ErrorBoundary.mdx` | Components | |
| 4.8 Create `src/components/RouteGenerator.mdx` | Components | |
| 4.9 Create `src/components/PermissionGate.mdx` | Components | |
| 4.10 Create `src/components/ConditionalCard.mdx` | Components | |
| 4.11 Create `src/components/CascadedTable.mdx` | Components | |
| 4.12 Create `src/components/MasterDetail.mdx` | Components | |
| 4.13 Create `src/components/PivotTable.mdx` | Components | |
| 4.14 Create `src/components/PolymorphicLayout.mdx` | Components | |
| 4.15 Create `src/components/PortalMenu.mdx` | Components | |
| 4.16 Create `src/components/FileUpload.mdx` | Components | |
| 4.17 Create `src/components/ThemeProvider.mdx` | Components | |
| 4.18 Create `src/components/I18nProvider.mdx` | Components | |
| 4.19 Create `src/components/Performance.mdx` | Components | LazyPage, SkeletonField, etc. |
| 4.20 Create `src/components/Accessibility.mdx` | Components | VisuallyHidden, SkipLink, etc. |
| 4.21 Create `src/factory/FormFactory.mdx` | Factory | |
| 4.22 Create `src/factory/TableFactory.mdx` | Factory | |
| 4.23 Create `src/factory/WidgetMap.mdx` | Factory | Widget taxonomy docs |
| 4.24 Create `src/factory/FieldResolver.mdx` | Factory | x-blong-* extension docs |
| 4.25 Create `src/factory/CardResolver.mdx` | Factory | |
| 4.26 Create `src/factory/LayoutResolver.mdx` | Factory | |
| 4.27 Create `src/factory/NestedFields.mdx` | Factory | |
| 4.28 Create `src/factory/CascadedDropdown.mdx` | Factory | |
| 4.29 Create `src/factory/CustomWidgetRenderer.mdx` | Factory | |
| 4.30 Create `src/design/DesignEditor.mdx` | Design | Main design editor docs |
| 4.31 Create `src/hooks/useApi.mdx` | Hooks | RPC query/mutation hooks |
| 4.32 Create `src/hooks/useSchema.mdx` | Hooks | Schema fetching docs |
| 4.33 Create `src/hooks/useTheme.mdx` | Hooks | Theme management docs |
| 4.34 Create `src/auth/AuthProvider.mdx` | Auth | Authentication flow docs |

MDX template pattern for each file:

```mdx
import {Meta, ArgTypes, Canvas, Story} from '@storybook/blocks';
import * as Stories from './ComponentName.stories';

<Meta of={Stories} />

# ComponentName

Brief description of what the component does and when to use it.

## Usage

<Canvas of={Stories.Default} />

## Props

<ArgTypes of={Stories} />

## Design Notes

Any special behavior, patterns, or integration notes.
```

---

## Gap 5: Limited Theme Support

### Current State

`ThemeProvider` and `useTheme` support a simple `'light' | 'dark' | 'system'`
toggle. This applies CSS classes (`blong-light`/`blong-dark`) and sets
`color-scheme` on `<html>`.

There is no:
- PrimeReact theme selection (Lara, Aura, Nora, Material, etc.)
- Dynamic CSS theme loading
- Storybook theme toolbar for previewing themes
- Theme persistence to localStorage

ut-prime ships 4 themes by default and the portal configuration
(`portal.params.get`) returns the active theme name.

### Approach

PrimeReact v10+ uses a CSS layer / design token approach with
`PrimeReactProvider` and theme packages (`@primereact/themes/*`).
Rather than bundling all themes, blong-ui should:

1. Extend `ThemeMode` to also include a `themeName` property for
   the PrimeReact theme preset name
2. Provide a `themes` registry mapping theme names to their
   PrimeReact preset import
3. Default to 4 themes matching ut-prime: Lara Light, Lara Dark,
   Aura Light, Aura Dark
4. Allow suites to register additional themes (all PrimeReact themes
   supported)
5. Persist theme choice to `localStorage`
6. Read initial theme from `portal.params.get` server response

### Tasks

| Task | Scope | Notes |
|------|-------|-------|
| 5.1 Extend `ThemeContextValue` | useTheme.ts | Add `themeName: string`, `setThemeName(name: string)`, `availableThemes: string[]` |
| 5.2 Create theme registry | src/themes/registry.ts | Map theme names to PrimeReact preset configs. Default: `lara-light`, `lara-dark`, `aura-light`, `aura-dark`. Export `registerTheme()` for suite-level additions |
| 5.3 Update `ThemeProvider` | ThemeProvider.tsx | Wrap children in `PrimeReactProvider` with the active theme preset value. Load theme CSS dynamically when `themeName` changes |
| 5.4 Add localStorage persistence | useTheme.ts | Read/write `blong-theme` and `blong-theme-name` keys |
| 5.5 Read theme from portal config | ThemeProvider.tsx | Use `portal.params.get` response `theme` field as initial theme if no localStorage override |
| 5.6 Create `ThemeSelector` component | src/components/ThemeSelector.tsx | Dropdown/button group for switching between available themes |
| 5.7 Add Storybook theme toolbar | .storybook/preview.ts | Add `globalTypes.theme` toolbar with all registered themes; decorator applies selected theme to `PrimeReactProvider`. This enables reviewers to preview any story in any theme |
| 5.8 Update `ThemeProvider.stories.tsx` | Stories | Stories for each theme, ThemeSelector interaction |
| 5.9 Document theme extension pattern | src/components/ThemeProvider.mdx | How suites register custom themes |

---

## Gap 6: No Portal-Level Comprehensive Stories

### Current State

ut-model's `portal/index.stories.js` provides comprehensive stories that
demonstrate the full portal experience: login → navigate menu → browse
table → open detail → edit → save → search. These exercise the entire
metadata-driven UI pipeline end-to-end.

blong-ui has no equivalent.

### Approach

Create a `stories/Portal.stories.tsx` that composes the full application:
`AuthProvider` + `ThemeProvider` + `I18nProvider` + `PageShell` +
`PortalMenu` + `AutoRoutes`, with mock API responses for a sample entity
(e.g., "User" CRUD). This requires mocking the `useRpcQuery` /
`useRpcFetch` / `useRpcMutation` hooks.

### Tasks

| Task | Scope | Notes |
|------|-------|-------|
| 6.1 Create mock API helper | stories/helpers/mockApi.ts | Utility to mock `rpcCall` / `setApiConfig` for Storybook stories. Provide `createMockHandlers(schema, data)` that intercepts RPC calls and returns mock responses |
| 6.2 Create sample entity schemas | stories/helpers/sampleSchemas.ts | User, Role, Permission schemas with x-blong-* extensions, cards, layouts |
| 6.3 Create `Portal.stories.tsx` | Stories | Full portal story: login, menu, browse, open, edit, create, search |
| 6.4 Add CRUD workflow stories | Portal.stories.tsx | `BrowseUsers`, `CreateUser`, `EditUser`, `SearchUsers`, `DeleteUser` individual stories |
| 6.5 Add `play()` functions for portal stories | Portal.stories.tsx | Full user journey interaction tests |
| 6.6 Add advanced pattern portal stories | Portal.stories.tsx | MasterDetail flow, CascadedDropdown flow, PolymorphicLayout flow |

---

## Gap 7: Missing ui-demo Reference Suite

### Current State

The original plan (Phase 5, Task 5.1) calls for a reference suite at
`core/ui-demo` (later referenced as `dev/ui-demo` in `.gitignore`).
This suite does not exist. The `.gitignore` already has rules to include
`dev/ui-demo` even though the `dev/` directory is otherwise ignored.

A reference suite is critical because:
- It demonstrates how to wire blong-ui in a real suite
- It provides a running application for Playwright e2e tests
- It gives developers a working starting point to copy

### Tasks

| Task | Scope | Notes |
|------|-------|-------|
| 7.1 Create `dev/ui-demo/` directory structure | Scaffold | `package.json`, `tsconfig.json`, `server.ts`, `browser.ts`, `index.ts` |
| 7.2 Register in `rush.json` | Config | Add `@feasibleone/ui-demo` with `projectFolder: "dev/ui-demo"`, tag `"dev"` |
| 7.3 Create sample realm | Realm | A `demo` realm with gateway + orchestrator + adapter for a sample "Item" entity |
| 7.4 Create browser entry point | Browser | `browser.ts` importing blong-ui components, `PageShell`, `AutoRoutes`, `AuthProvider`, `ThemeProvider` |
| 7.5 Create sample pages | Components | `item.browse.tsx`, `item.new.tsx`, `item.open.tsx` demonstrating the metadata-driven approach |
| 7.6 Add Storybook to ui-demo | Config | `.storybook/main.ts`, `.storybook/preview.ts`, story files for the demo pages |
| 7.7 Add Storybook scripts to ui-demo | package.json | `storybook`, `build-storybook`, `storybook:test`, `visual:update` scripts |
| 7.8 Create portal story | Stories | Full portal story equivalent to ut-model's `portal/index.stories.js` |
| 7.9 Add snapshot baseline | Testing | Run `visual:update` to generate initial snapshots for ui-demo stories |
| 7.10 Add Playwright test scaffolding | Testing | Basic e2e test: login → browse → open → edit → save |

---

## Implementation Order

The gaps have dependencies between them. The recommended order:

```
Phase A: Infrastructure & Theme (Gaps 5, 4.1, 3.1)
  ├── 5.1–5.7  Extend theme support
  ├── 4.1      Update Storybook main.ts for MDX
  └── 3.1      Configure snapshot test runner

Phase B: Stories & Interaction Tests (Gaps 1, 2)
  ├── 1.1–1.34  Create all missing stories
  └── 2.1–2.5   Add play() functions to all stories

Phase C: Documentation (Gap 4)
  └── 4.2–4.34  Create README.mdx for all components

Phase D: Portal Stories (Gap 6)
  ├── 6.1–6.2  Create mock helpers
  └── 6.3–6.6  Create portal-level stories

Phase E: Snapshots & Demo (Gaps 3, 7)
  ├── 3.2–3.4  Generate baselines, CI step, docs
  └── 7.1–7.10 Create ui-demo reference suite
```

Phase A comes first because theme support and MDX configuration are
prerequisites for writing correct stories and docs. Phase B and C can
proceed in parallel. Phase D depends on Phase B (story patterns
established). Phase E is last because snapshots need all stories to
exist, and ui-demo needs blong-ui to be feature-complete.

---

## Considerations

### Assumptions

- Storybook v10 with `@storybook/react-vite` is the target (already
  configured)
- PrimeReact v10+ with design token theming is available
- The `@storybook/test-runner` + Playwright backend is used for
  interaction tests (already in devDependencies)
- `jest-image-snapshot` is used for visual snapshots (already in
  devDependencies)
- Chromatic handles visual regression in CI (already configured)

### Constraints

- Stories must work without a running server — all API calls need
  mocking via story decorators or MSW
- MDX files must follow Storybook v10 syntax (CSF3 + `@storybook/blocks`)
- Theme switching must not require page reload
- The ui-demo suite must work as a standalone Rush project within the
  monorepo

### Risks

| Risk | Mitigation |
|------|-----------|
| PrimeReact theme imports may be large | Use dynamic imports; only load active theme CSS |
| Snapshot tests may be flaky with dynamic content | Use `waitForSelector` in `postRender` hook; mock dates/random values |
| MDX documentation may become stale | Reference live stories in MDX via `<Canvas of={...} />`; props table auto-generated from types |
| ui-demo may diverge from blong-ui | ui-demo imports blong-ui as a workspace dependency; CI builds both |

---

## Not Included

- Figma/design system integration (separate effort)
- Chromatic TurboSnap optimization (can be added incrementally)
- Storybook composition from multiple packages (ui-demo composing
  blong-ui stories — future enhancement)
- Performance benchmarking stories (separate effort)
- Mobile-responsive story viewports (can be added to existing stories
  via Storybook viewport addon later)
