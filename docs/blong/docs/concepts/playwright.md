# Full-Stack Testing with Playwright

Full-stack testing verifies the entire application stack — from the browser UI through the
React component layer, JSON-RPC transport, server-side handlers, and back — in a single test
run. Blong integrates Playwright for this purpose, providing reusable fixtures and test helpers
that work with any blong suite.

## Why Full-Stack Tests?

Unit tests (vitest) verify components in isolation. Storybook interaction tests verify component
behaviour with mocked data. Full-stack Playwright tests fill the remaining gap:

| Test type        | Scope                    | Speed   | Confidence |
| ---------------- | ------------------------ | ------- | ---------- |
| Unit (vitest)    | Single component/hook    | Fast    | Low        |
| Storybook        | Component + mock data    | Medium  | Medium     |
| **Playwright**   | **Browser → Server → DB mock** | Slower  | **High**   |
| Integration (tap)| Server API only          | Medium  | Medium     |

Playwright tests catch issues that other test types cannot:

- Login flow and JWT token handling
- Menu generation from model specs
- Form validation end-to-end (client + server)
- Tab lifecycle (open, dirty state, close)
- Data round-trip (create → browse → edit → verify)

## How It Works

```
Playwright                 Vite Dev Server              Blong Server
┌──────────┐   HTTP/WS    ┌──────────────┐   /rpc →   ┌────────────┐
│ Test code │ ──────────→  │ React app    │ ─────────→ │ Gateway    │
│ (Node.js) │              │ (port 5173)  │            │ Orchestrator│
│           │              │              │            │ Mock adapter│
│ Portal    │ ← screenshot │              │ ← JSON-RPC │            │
│ helper    │              │              │            │ (port 8080)│
└──────────┘               └──────────────┘            └────────────┘
```

The test runner controls a real browser. The Vite dev server serves the React application and
proxies `/rpc` calls to the blong server. The blong server runs with mock adapters that provide
deterministic fixture data.

## Element Identification

Tests must identify UI elements without depending on visible text (which changes with i18n
translations). The strategy, in priority order:

1. **HTML `name` attribute** — all form inputs carry a `name` derived from the schema field path
   (e.g. `coral.coralName`). Use `input[name="coral.coralName"]` or `textarea[name="..."]`.

2. **HTML `id` attribute** — PrimeReact widgets that don't set `name` (Dropdown, Checkbox,
   Calendar/Date) use `inputId` which renders as `id`. **IDs use hyphens** where `name` uses dots:
   `coral.familyId` → `id="coral-familyId"`.

3. **Semantic HTML roles** — `button[type="submit"]`, `form`, `a[href]`.

4. **`data-testid`** — used only where no semantic identifier exists:
   - Toolbar buttons: `editor-save`, `editor-edit`, `editor-cancel`, `editor-refresh`
   - Portal menu items: `portal-menu-{method}` (semantic triple with dots→dashes)
   - Portal menu groups: `portal-menu-{subject}`
   - Login submit: `login-submit`
   - Table cells: `{fieldName}-{rowIndex}`
   - Dropdown widgets: `data-testid` on wrapper div (e.g. `coral-familyId`, uses hyphens)
   - Table search input: `browse-search`

### Dots vs Hyphens

The form system uses two naming conventions:

- **`name` attribute**: dots for hierarchy (`coral.coralName`, `coral.familyId`)
- **`id` and `data-testid`**: hyphens (`coral-coralName`, `coral-familyId`)

This split exists because dots are problematic in CSS ID selectors (`#coral.familyId` is parsed
as `#coral` with class `.familyId`). The model form system converts dots to hyphens when generating
widget IDs. The `fillFields()` helper in `blong-browser/playwright/model` handles this conversion
automatically.

## Widget Type Auto-Detection

The `fillFields()` helper auto-detects widget types from `blong-*` CSS classes in the DOM.
This means test code only needs to provide field names and plain values — no explicit
`{widget: 'select', value: '...'}` objects required. The helper walks up from the element
with the matching `id` or `data-testid` until it finds a `blong-*` class:

| CSS class             | Widget type |
| --------------------- | ----------- |
| `blong-input`         | text        |
| `blong-textarea`      | textarea    |
| `blong-number`        | number      |
| `blong-dropdown`      | dropdown    |
| `blong-select-wrapper`| select      |
| `blong-boolean`       | checkbox    |
| `blong-date`          | date        |

Explicit `{widget: ..., value: ...}` objects are still supported as an override.

## Configurable Permissions

The `portal` fixture does **not** grant permissions by default (`blongPermissions` defaults to
`false`). Suites that need full CRUD access must opt in per test file or describe block with
`test.use({blongPermissions: true})`.

## Shared Configuration

The `defineBlongConfig()` helper from `@feasibleone/blong-browser/playwright/config` provides
sensible defaults (test directory, viewport, reporters, `webServer` entries for CI). Suite-level
`playwright.config.ts` files stay minimal:

```typescript
import {defineBlongConfig} from '@feasibleone/blong-browser/playwright/config';
export default defineBlongConfig();
```

The `webServer` entries auto-start both the blong server (port 8080) and Vite dev server (port
5173) when `process.env.CI` is set, enabling headless CI runs with `node --run ci-test`.

## Handling Stateful Mock Data

Mock adapters keep fixture data in memory. When a create test adds a record, it persists across
test runs (as long as the server stays running). This creates a challenge for edit tests: if the
record already contains the same values from a previous run, react-hook-form doesn't mark the
form as dirty and the Save button stays disabled.

The `createAndEditModel()` helper solves this with a **dirty cycle**: it first saves with a random
suffix appended to text fields (forcing a dirty state), then fills the actual edit values (which
differ from the suffixed values, so the form is dirty again). This ensures the edit test works
regardless of prior server state.

Similarly, the `waitForFormData()` method on the Portal helper waits for API data to populate form
inputs before filling fields, preventing race conditions.

## Static Keys for Hot Reload Survival

The blong server generates random JWT signing and encryption keys by default (in `dev` intent).
When the server hot-reloads after a code change, the keys change and all existing browser sessions
become invalid.

For the `integration` intent (which is active during Playwright test development), static JWK
keys are configured in the suite's `server.ts`. This means browser sessions survive server
restarts, so developers can iterate on tests without re-logging in manually.

## Screenshot-First Assertions

Tests prefer `toHaveScreenshot()` over targeted assertions:

- Screenshots catch visual regressions (layout breaks, CSS issues, missing icons)
- They serve as living documentation of the expected UI
- Updating baselines is a single command: `node --run playwright:update`
- Targeted assertions (`toBeVisible`, `toHaveValue`) are used sparingly for critical state

## Reusable Test Infrastructure

The test infrastructure is split into layers:

- **`@feasibleone/blong-browser/playwright`** — the `portal` fixture handles login automatically
  and provides a `Portal` helper class with methods for menu navigation, form interaction, save,
  and table operations.

- **`@feasibleone/blong-browser/playwright/config`** — `defineBlongConfig()` provides shared
  Playwright configuration with sensible defaults, including `webServer` entries for CI.

- **`@feasibleone/blong-browser/playwright/model`** — generic CRUD test generators
  (`browseModel`, `createAndEditModel`) that work with any model spec. Pass the subject, object,
  and field map — the helper generates complete browse/create/edit test scenarios.

- **`blong-dev playwright`** — CLI wrapper that resolves the Playwright binary and forwards
  arguments.

## Relationship to Other Test Types

Full-stack Playwright tests complement, not replace, other testing approaches:

- **Storybook tests** remain the primary tool for component-level visual testing
- **tap/vitest** remain the primary tool for logic and API testing
- **Playwright** tests verify the integration of all layers working together

Use Playwright for critical user journeys (login, CRUD, navigation). Use Storybook for
component variations and edge cases. Use tap for server-side business logic.
