---
name: blong-playwright
description:
    Write full-stack Playwright tests for Blong applications. The blong-browser package provides
    reusable fixtures (auto-login, Portal helper) and generic CRUD test helpers that work with any
    model spec. Tests run against the live dev server (Vite + blong-watch) and use primarily
    screenshot-based assertions. Use this skill whenever the user wants to write E2E tests, UI
    integration tests, Playwright tests, or full-stack browser tests — even if they just say 'test
    the UI' or 'add a visual test'.
---

# Full-Stack Testing with Playwright

## Overview

Blong provides a Playwright testing setup that runs full-stack tests against the live development
server. The tests open the real UI in a browser, log in, navigate via the portal menu, interact with
forms and tables, and verify results via screenshots and targeted assertions.

The infrastructure is split across three packages:

| Package                                     | Provides                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| **blong-browser**                           | Reusable fixtures (`portal`), Portal helper, model CRUD helpers, shared config |
| **blong-dev**                               | `blong-dev playwright` CLI wrapper                                             |
| **suite (e.g. blong-suite / blong-marine)** | `playwright.config.ts`, test files (`*.play.ts`)                               |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Playwright Test Runner                             │
│  ├── test/*.play.ts                                 │
│  │   └── import {test, expect} from                 │
│  │       '@feasibleone/blong-browser/playwright'    │
│  └── playwright.config.ts                           │
├─────────────────────────────────────────────────────┤
│  blong-browser/src/playwright.ts                    │
│  ├── Portal class (menu, save, fill, table helpers) │
│  ├── test fixture (auto-login via portal fixture)   │
│  └── IBlongTestOptions (credentials + permissions)  │
├─────────────────────────────────────────────────────┤
│  blong-browser/src/playwright/config.ts             │
│  └── defineBlongConfig() — shared Playwright config │
├─────────────────────────────────────────────────────┤
│  blong-browser/src/playwright/model.ts              │
│  ├── browseModel()     — generic browse test        │
│  └── createAndEditModel() — generic CRUD test       │
├─────────────────────────────────────────────────────┤
│  Vite dev server (port 5173) ← proxy → blong-watch (port 8080) │
│  ├── Browser (React app)                            │
│  └── Server (blong runtime with mock adapters)      │
└─────────────────────────────────────────────────────┘
```

## Prerequisites

### Local development

Start both servers manually, then run tests:

```bash
# Terminal 1: Start the blong server (with hot reload)
cd core/blong-marine   # or core/blong-suite for the full suite
node --run blong

# Terminal 2: Start the Vite dev server
cd core/blong-marine   # or core/blong-suite
node --run dev

# Terminal 3: Run Playwright tests
cd core/blong-marine   # or core/blong-suite
node --run playwright
```

### CI / automated runs

The `defineBlongConfig()` includes `webServer` entries that auto-start both servers when
`reuseExistingServer` is `false` (the default in CI where `process.env.CI` is set). Just run:

```bash
node --run ci-test
```

The default intent for `blong-watch` is `dev + microservice + integration`. The `integration` intent
activates static gateway keys in the suite's server.ts, so browser sessions survive server
hot-reloads.

## Element Identification Strategy

Tests identify UI elements using this priority order:

1. **`name` attribute** — form inputs (`input[name="coral.coralName"]`, `textarea[name="..."]`). The
   `name` attribute uses dots to reflect the form hierarchy (e.g. `coral.coralName`).
2. **`id` attribute** — widgets that don't set `name` (Dropdown, Checkbox, Calendar/Date). **IDs use
   hyphens** where `name` uses dots: `coral.familyId` → `id="coral-familyId"`. The `fillFields()`
   helper handles this conversion automatically.
3. **Role / semantic HTML** — buttons by type (`button[type="submit"]`), form by id
4. **`data-testid`** — only where no semantic identifier exists:
    - Icon-only toolbar buttons: `editor-save`, `editor-edit`, `editor-cancel`, `editor-refresh`
    - Portal menu items: `portal-menu-{method}` (e.g. `portal-menu-marine-coral-browse`)
    - Portal menu groups: `portal-menu-{subject}` (e.g. `portal-menu-marine`)
    - Login submit: `login-submit`
    - Table cell IDs: `{fieldName}-{rowIndex}`
    - Table action buttons: `{fieldName}-addButton`, `{fieldName}-deleteButton`
    - Dropdown widgets: `data-testid` on wrapper div uses hyphens (e.g. `coral-familyId`)
    - Table search input: `browse-search`

**Labels and titles are never used for element identification** — they change with i18n
translations.

### Widget DOM Patterns

Each PrimeReact widget renders differently. The `fillFields()` helper handles each:

| Widget       | Selector used                                   | DOM structure                                                         |
| ------------ | ----------------------------------------------- | --------------------------------------------------------------------- |
| **text**     | `input[name="coral.coralName"]`                 | `<input name="coral.coralName" id="coral-coralName">`                 |
| **textarea** | `textarea[name="coral.description"]`            | `<textarea name="coral.description">`                                 |
| **number**   | `input[name="coral.maxDepth"]`                  | `<input name="coral.maxDepth" role="spinbutton">`                     |
| **select**   | `.p-selectbutton [role="button"]:has-text(...)` | No field-specific selector needed; matches by text                    |
| **dropdown** | `[data-testid="coral-familyId"]`                | Wrapper div has `data-testid`; internal `<input id="coral-familyId">` |
| **checkbox** | `input[type="checkbox"][id="coral-endangered"]` | No `data-testid`; uses `inputId` → `id` on input                      |
| **date**     | `input[id="coral-discovered"]`                  | Calendar sets `inputId` → `id` on input; no `name` attr               |

**Key rule**: `name` attributes use dots (`coral.coralName`), `id` and `data-testid` attributes use
hyphens (`coral-coralName`). This is because PrimeReact widgets receive `id` from the model system
which converts dots to hyphens (dots are problematic in CSS ID selectors).

## Implementing Playwright Tests

### Step 1: Configure the suite

Create `playwright.config.ts` using the shared config helper:

```typescript
import {defineBlongConfig} from '@feasibleone/blong-browser/playwright/config';
export default defineBlongConfig();
```

`defineBlongConfig()` provides sensible defaults: test directory, viewport, reporters, `webServer`
entries for both blong and Vite (auto-started in CI), and default login credentials. Override any
setting via the options parameter:

```typescript
export default defineBlongConfig({
    timeout: 60_000,
    use: {blongPermissions: true},
});
```

**Realm packages**: When a suite (e.g. `blong-suite`) runs tests from multiple realm packages, list
them in `realmPackages`. Each package's `test/` folder becomes a separate Playwright project:

```typescript
// core/blong-suite/playwright.config.ts — blong-suite
export default defineBlongConfig({
    realmPackages: ['@feasibleone/blong-marine'],
    // To add another realm: append its package name here
});
```

Standalone realms (e.g. `blong-marine`) do NOT need `realmPackages` — their own `test/` folder is
the default project.

Add to `package.json`:

```json
{
    "scripts": {
        "ci-test": "blong-dev playwright",
        "playwright": "blong-dev playwright",
        "playwright:update": "blong-dev playwright --update-snapshots"
    },
    "devDependencies": {
        "@playwright/test": "^1.52.0"
    }
}
```

### Step 2: Write a test file

Tests use the `.play.ts` extension by convention.

```typescript
// test/portal.play.ts
import {test, expect} from '@feasibleone/blong-browser/playwright';

test('portal loads after login', async ({portal}) => {
    await expect(portal.page.locator('.blong-portal-menubar')).toBeVisible();
    await expect(portal.page).toHaveScreenshot('portal-home.png');
});
```

The `portal` fixture automatically:

1. Navigates to `baseURL`
2. Fills and submits the login form
3. Waits for the portal menubar to appear
4. Provides a `Portal` helper with convenience methods

### Step 3: Use generic model CRUD helpers

For model-based pages, use the reusable helpers. Widget types are **auto-detected** from the DOM
using `blong-*` CSS classes — just pass plain values:

```typescript
// test/coral.play.ts
import {test, expect} from '@feasibleone/blong-browser/playwright';
import {browseModel, createAndEditModel} from '@feasibleone/blong-browser/playwright/model';

test.describe('Marine Coral', () => {
    browseModel(test, expect, {
        subject: 'marine',
        object: 'coral',
        searchText: 'Staghorn',
    });

    createAndEditModel(test, expect, {
        subject: 'marine',
        object: 'coral',
        fields: {
            'coral.coralName': 'Test Playwright Coral',
            'coral.coralType': 'Soft Coral', // auto-detected as select
            'coral.familyId': 'Gorgoniidae', // auto-detected as dropdown
            'coral.maxDepth': 25, // auto-detected as number
            'coral.endangered': true, // auto-detected as checkbox
            'coral.discovered': '06/15/2024', // auto-detected as date
            'coral.description': 'A test coral', // auto-detected as textarea
        },
        editFields: {
            'coral.coralName': 'Test Playwright Coral Edited',
        },
    });
});
```

### Step 4: Write custom interaction tests

For flows beyond standard CRUD:

```typescript
import {test, expect} from '@feasibleone/blong-browser/playwright';

test('navigate coral by family', async ({portal}) => {
    await portal.menuClick('marine.coral.browse');
    await portal.waitForTableData();

    // Click a family in the navigator tree
    await portal.page.locator('.p-tree-node-content').first().click();

    // Verify filtered results
    await expect(portal.page).toHaveScreenshot('coral-filtered-by-family.png');
});
```

## Portal Helper API

The `Portal` class wraps common interactions:

| Method                           | Description                                                               |
| -------------------------------- | ------------------------------------------------------------------------- |
| `login(username, password)`      | Fill and submit the login form                                            |
| `menuClick(method)`              | Open a portal menu item by semantic triple                                |
| `save()`                         | Click save and wait for success icon                                      |
| `edit()`                         | Click the edit button                                                     |
| `cancel()`                       | Click the reset/cancel button                                             |
| `refresh()`                      | Click the refresh button                                                  |
| `fill(fieldName, value)`         | Fill an input by name attribute                                           |
| `fillTextarea(fieldName, value)` | Fill a textarea by name attribute                                         |
| `tableRowClick(field, index)`    | Click a table cell by data-testid                                         |
| `tableRowClickByText(text)`      | Click a table row containing text                                         |
| `tableAdd(fieldName)`            | Click the table add button                                                |
| `tableDelete(fieldName)`         | Click the table delete button                                             |
| `waitForFormLoad()`              | Wait for form/editor to be visible and skeleton to disappear              |
| `waitForFormData()`              | Wait for API data to populate form inputs (use after `waitForFormLoad()`) |
| `waitForTableData()`             | Wait for table rows to appear                                             |

## Model Test Helpers

### `browseModel(test, expect, options)`

Generates a test that opens the browse page and takes a screenshot.

Options:

- `subject` — realm subject name
- `object` — entity object name
- `searchText` — optional text to type in the browse search input before screenshotting

### `createAndEditModel(test, expect, options)`

Generates create and edit tests.

Options:

- `subject`, `object` — entity identification
- `fields` — map of field names to values for creation
- `editFields` — map of field names to new values for editing
- `search` — optional browse-search text to filter by before opening a row in the edit test, so it
  targets a specific (e.g. test-created) row instead of the first row of the unfiltered table
- `editInCreate` — whether the create test also applies `editFields` right after save in the same
  tab (default `true`; set `false` when the created record must keep its create default so the
  edit test can change a non-text field like a date to a distinct value)

Field values can be plain strings, numbers, or booleans — the widget type is **auto-detected** from
`blong-*` CSS classes in the DOM:

```typescript
'coral.coralName': 'Test Coral',        // string → auto-detected as text/textarea/select
'coral.familyId': 'Gorgoniidae',        // string → auto-detected as dropdown
'coral.maxDepth': 25,                   // number → auto-detected as number
'coral.endangered': true,               // boolean → auto-detected as checkbox
'coral.discovered': '06/15/2024',       // string → auto-detected as date
```

For explicit widget type override, use the object form:

```typescript
{widget: 'select', value: 'hard'}
```

#### Widget Auto-Detection

The `fillFields()` helper walks up from each form element in the DOM looking for `blong-*` CSS
classes. The mapping is:

| CSS class              | Widget type |
| ---------------------- | ----------- |
| `blong-input`          | text        |
| `blong-textarea`       | textarea    |
| `blong-number`         | number      |
| `blong-dropdown`       | dropdown    |
| `blong-select-wrapper` | select      |
| `blong-boolean`        | checkbox    |
| `blong-date`           | date        |

### Handling Stateful Mock Servers (Dirty Cycle)

When the server uses a stateful mock (mock `add` mutates an in-memory fixture array), the **edit
test** may find the record already contains the same values from a previous run. Since
react-hook-form doesn't mark the form as dirty when values match, the Save button stays disabled.

The `createAndEditModel()` helper solves this with a **dirty cycle**:

1. Opens the record and waits for API data to load (`waitForFormData()`)
2. Text/textarea fields get a random suffix → form becomes dirty → saves; other widgets
   (date/select/dropdown/number) keep their value because the `editFields` values already differ
   from the loaded record — a single save then suffices
3. Fills the actual `editFields` values → form is dirty again (differs from suffixed) → saves
4. Takes screenshots at both steps

This ensures the edit test works regardless of prior server state. When `search` is set, the edit
test filters the browse table to that text before opening a row, so it never opens seeded data.

## Static Gateway Keys

To prevent session invalidation when the blong server hot-reloads, the gateway includes static keys
for the `integration` intent.

## Testing Best Practices

1. **Prefer screenshots over assertions** — `toHaveScreenshot()` catches visual regressions that
   targeted assertions would miss.
2. **Use targeted assertions sparingly** — for critical state (field values after save, row counts).
3. **Never identify elements by label/title** — these change with translations.
4. **Use `name` attributes for form fields** — they are the stable semantic identifiers.
5. **Use `data-testid` only as fallback** — for icon-only buttons and generated menu items.
6. **Keep tests independent** — each test logs in fresh via the `portal` fixture.
7. **Use model helpers for standard CRUD** — write custom tests only for non-standard flows.
8. **Use `waitForFormData()` before editing** — prevents race conditions where the test fills fields
   before the API response populates them.
9. **Dots vs hyphens** — form `name` attributes use dots (`coral.coralName`), widget `id` and
   `data-testid` attributes use hyphens (`coral-coralName`). The `fillFields()` helper handles this
   automatically.
10. **Choose unique select values** — when a form has multiple `SelectButton` widgets, pick values
    unique across all options on the form to avoid ambiguous substring matches.
11. **Close date pickers** — after filling a Calendar/Date input, press `Escape` to close the picker
    overlay before moving to the next field.
12. **Let auto-detection work** — prefer plain field values over explicit
    `{widget: ..., value: ...}` objects. Auto-detection from `blong-*` CSS classes is accurate and
    keeps tests concise.

## Permissions

The `portal` fixture does **not** grant permissions by default (`blongPermissions` defaults to
`false`). Suites that need full CRUD access must opt in explicitly:

```typescript
// Grant permissions for an entire test file
test.use({blongPermissions: true});

// Or within a describe block
test.describe('admin user', () => {
    test.use({blongPermissions: true});
    test('can save', async ({portal}) => {
        // ...
    });
});
```

When `blongPermissions` is `true`, the portal calls `setPermissions(true)` on the app store after
login, making all permission-gated toolbar buttons visible.

When `blongPermissions` is `false` (the default), the session has only the permissions assigned by
the authentication provider.

## File Structure

### Suite-level

```
suite-root/
├── playwright.config.ts      # import {defineBlongConfig} from '...'; export default defineBlongConfig();
├── test/
│   ├── coral.play.ts         # Coral CRUD tests
│   └── *.play.ts             # Additional test files
└── package.json              # ci-test, playwright, playwright:update scripts
```

### Framework-level (blong-browser)

```
core/blong-browser/
├── src/
│   ├── playwright.ts              # Fixtures, Portal class, test export
│   └── playwright/
│       ├── config.ts              # defineBlongConfig() shared configuration
│       └── model.ts               # Generic CRUD test helpers
└── package.json                   # exports: ./playwright, ./playwright/config, ./playwright/model
```
