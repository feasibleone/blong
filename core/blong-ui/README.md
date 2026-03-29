# @feasibleone/blong-ui

Metadata-driven browser UI framework for Blong. Generates forms, tables, and detail views from JSON Schema definitions, with optional design-mode WYSIWYG customisation.

## Getting Started

```ts
import {FormCard} from '@feasibleone/blong-ui';
import {AuthProvider} from '@feasibleone/blong-ui/auth';
```

## Storybook

Browse all components interactively:

```bash
npm run storybook        # start dev server at http://localhost:6006
npm run build-storybook  # build static Storybook to storybook-static/
```

## Testing

### Interaction tests (play functions)

Every story with interactive elements has a `play()` function that exercises the primary user flow. Run all interaction tests against a running Storybook:

```bash
# Against the dev server (start storybook first):
npm run storybook:test

# Headless CI mode (builds Storybook, serves it, runs tests, then exits):
npm run storybook:test:ci
# or via Rush:
node common/scripts/install-run-rush.js ci-storybook --to @feasibleone/blong-ui
```

### Visual regression snapshots

Baseline PNG snapshots live in `stories/__snapshots__/`. Each story has one `.png` file named after its Storybook ID (e.g. `components-formcard--create-mode.png`).

**First-time setup** (already done — baselines are committed):

```bash
npm run visual:update    # rebuilds Storybook + regenerates all baselines
```

**After intentional UI changes** — update affected baselines:

```bash
# Update a single story:
npm run storybook:test -- --updateSnapshot --testNamePattern "FormCard"

# Update all baselines:
npm run visual:update
```

**Reviewing failures in CI:**

When the `storybook-tests` CI job fails, diff images are uploaded as the `storybook-snapshot-diffs` artifact under `stories/__snapshots__/__diff_output__/`. Download and inspect the side-by-side diffs, then run `npm run visual:update` locally if the change is intentional.

### Threshold

The snapshot runner uses a **2% pixel difference threshold** (`failureThreshold: 0.02`). Minor anti-aliasing differences between OS/GPU renderers are tolerated; structural layout changes will fail.

## Architecture

```
src/
  components/   Public React components (FormCard, TableCard, MasterDetail, …)
  factory/      Internal rendering primitives (FormFactory, TableFactory, …)
  hooks/        React hooks (useApi, useSchema, useTheme, …)
  auth/         Authentication (AuthProvider, LoginForm, ProtectedRoute)
  design/       WYSIWYG design editor (DesignEditor, Inspector, …)
  themes/       PrimeReact theme registry and CSS loader
  types.ts      Shared TypeScript types

stories/        Storybook stories (one file per exportable unit)
  helpers/      Shared story utilities (fakeJwt, mockApi, sampleSchemas)
  __snapshots__ Baseline PNG files for visual regression
```

## Theming

Four PrimeReact presets are enabled by default: `lara-light`, `lara-dark`, `aura-light`, `aura-dark`. Switch themes via the **Theme** toolbar in Storybook. Register additional themes at runtime:

```ts
import {registerTheme} from '@feasibleone/blong-ui';

registerTheme('bootstrap-light', {
    label: 'Bootstrap Light',
    cssPath: 'bootstrap4-light-blue/theme.css',
});
```
