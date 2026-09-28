---
name: storybook-v10-setup
description:
    Initial Storybook v10 setup and configuration for React/TypeScript projects. Use this skill for
    any first-time Storybook installation or major configuration task — even if the user just says
    'set up Storybook', 'add Storybook to this project', or 'configure addons'. Covers addon setup,
    monorepo composition, and CI/CD integration. For development workflow and testing patterns, see
    the storybook-testing-workflow skill.
---

# Storybook v10 Component Testing

> **Scaffold, don't transcribe.** `.storybook/main.ts`, `.storybook/preview.tsx` and story files
> come from
> `kukum storybook add --subject=<realm> --object=<entity> --kind=main|preview|story|portal`
> (`[KUKUM_API]` in `_shared/conventions.md`).

## Overview

Configure Storybook v10 for React/TypeScript component libraries with automatic screenshot and
markup snapshots, following modern best practices for component testing and documentation.

**For development workflow and testing patterns,** see **storybook-testing-workflow** skill.

## Blong realms — use the shared factories

A realm scaffolded from `blong-kopi` (every realm, via `blong realm <name>` or `kukum realm add`)
**already ships** `.storybook/main.ts`, `.storybook/preview.tsx`, `src/stories/<Object>.stories.tsx`
(the model pages), `src/stories/<Subject>.stories.tsx` (the portal shell) and the
`meta/fixture/<subject>Fixture.ts` the stories read. The snippets in _Quick Start_ below are for a
package outside Blong; in a realm only the following are realm-specific:

- **`.storybook/main.ts`** — `defineBlongStorybookMain({importMetaDirname: __dirname})`; stories
  default to `src/**`.
- **`.storybook/preview.tsx`** — `withBlong(browser)`, the default export of
  `@feasibleone/blong-browser/storybook.tsx`, over the composed entry (below).
- **`src/stories/*.stories.tsx`** —
  `page('{subject}.{object}.browse' | '.open' | '.new' | '.report')` from
  `@feasibleone/blong-browser/storyHelper` for a model page, and `portal()` for the whole shell.
- **scripts** — `storybook dev -p 6007`, `build-storybook`, `ci-storybook` (bulk Rush command).

Two imports are easy to get wrong, because both modules live in one package:

- `withBlong` is the **default** export of `@feasibleone/blong-browser/storybook.tsx`;
  `@feasibleone/blong-browser/storyHelper` exports `page`/`portal` and has **no** `withBlong`.
- `preview.tsx` composes the entry that carries the `ui.portal` port (T-162): a **realm**'s
  `index.browser.ts`, because the realm's own `browser.ts` is not composed — while a **suite**'s
  `browser.ts` already is, so a suite's preview imports `../browser.ts` (as `blong-suite` does).

Also note the export paths: they are `.../storyHelper`, `.../storybookMain` and `.../vite` —
appending `.ts`/`.tsx` to those (e.g. `.../storyHelper.tsx`) does not resolve, because they are
declared without an extension in `blong-browser`'s `exports`.

Every story renders against the **browser mock adapter** (the `storybook` intent, activated by
`withBlong`), fed by `meta/fixture`; nothing is fetched from a server, so a story needs the realm's
`browser.ts` to glob `meta/fixture/**/*.ts` or it renders empty. `kukum storybook add --kind=story`
does that for you — it splices the folder into both `browser.ts` children lists — and says so in the
result when the entry cannot be read or lists no `./meta` folder; only then add it by hand. Those
rows are Storybook's data: the app's Vite config stubs every `meta/fixture` module and this factory
removes that stub, so a Storybook gets the fixture and an app build does not — keep both halves, and
do not "fix" a missing fixture by adding the glob to `.storybook/`. Toggling a story between that
mock and a **real** backend is not implemented yet — see the todo on `withBlong` in
`core/blong-browser`'s memory, which also names the per-model `config.mock` switch in
`meta/db/db.ts` that lets a dev server serve a realm without a database.

A model that declares `layouts` earns one story per layout, because the layout is what a reviewer
comes to the story to see: `demo/blong-marine/src/stories/Coral.stories.tsx` is the reference, with
`page('marine.coral.open', 1, {layout: 'editSplit'})` beside the default, and a `play()` function on
one story that types a value and saves, as the only place a model's write path is exercised without
Playwright. A model without `layouts` needs no such variants.

Model story specifics (mock adapter, fixture data, the `meta/fixture` glob, `config.mock`) are in
the **blong-model** skill.

## Key Features

- **Visual Regression Testing**: Pixel-perfect screenshot comparison with jest-image-snapshot
- **Markup Snapshots**: DOM structure validation for catching structural regressions
- **Interaction Tests**: Automated behavior validation with play() functions
- **Accessibility Testing**: Built-in a11y addon with automated checks
- **Vite Integration**: Fast build and hot reload
- **Monorepo Support**: Multiple composition strategies for Rush.js/Blong projects

## Three-Tier Testing Approach

```
┌─────────────────────────────────────────────────────────────┐
│ Storybook v10 Testing Pyramid                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  🎬 Visual Regression Tests                                │
│     (jest-image-snapshot in Playwright)                     │
│     - Screenshot comparison                                 │
│     - Pixel-perfect regression detection                    │
│     └─ Runs: npm run storybook:test                        │
│                                                              │
│                 📋 Markup Snapshots                         │
│                   (DOM structure validation)                │
│                   - HTML structure comparison               │
│                   - Attribute validation                    │
│                   - Component hierarchy                     │
│                   └─ Runs: npm run storybook:test          │
│                                                              │
│           🎭 Interaction Tests                             │
│             (Storybook play functions)                      │
│             - User clicks, forms, navigation                │
│             - State changes                                 │
│             - WebSocket interactions                        │
│             └─ Automatic via play()                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Install Storybook

```bash
npx -y storybook@latest init --type react --builder vite
```

### 2. Package Configuration

Add to `package.json`:

```json
{
    "devDependencies": {
        "storybook": "^10.2.14",
        "@storybook/react": "^10.2.14",
        "@storybook/react-vite": "^10.2.14",
        "@storybook/addon-a11y": "^10.2.14",
        "@storybook/addon-docs": "^10.2.14",
        "@storybook/test-runner": "^0.24.2",
        "@playwright/test": "^1.63.0",
        "jest-image-snapshot": "^6.4.0"
    },
    "scripts": {
        "storybook": "storybook dev -p 6006",
        "storybook:build": "storybook build -o storybook-static",
        "storybook:test": "test-storybook",
        "storybook:test:ci": "storybook build && http-server storybook-static --port 6006 --silent & npx wait-on http://127.0.0.1:6006 && test-storybook && kill $(lsof -t -i:6006)",
        "visual:update": "npm run storybook:test -- --updateSnapshot"
    }
}
```

> **⚠️ v10 package changes**: `addon-essentials`, `addon-interactions`, `addon-links`, and
> `@storybook/test` are **v8-era packages** that do not exist in v10. Using them alongside
> `storybook@10` will cause version conflicts. The `storybook` (CLI) package is now separate from
> the framework packages — make sure all packages are pinned to the **same major version** (e.g.,
> all `^10.2.14`).
>
> `@chromatic-com/storybook@3.x` is only compatible with Storybook v8 — remove it if upgrading to
> v10.

### 3. Main Configuration

Create `.storybook/main.ts`:

```typescript
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {StorybookConfig} from '@storybook/react-vite';

const config: StorybookConfig = {
    stories: ['../src/**/*.stories.@(ts|tsx)'],
    addons: [getAbsolutePath('@storybook/addon-a11y'), getAbsolutePath('@storybook/addon-docs')],
    framework: {
        name: getAbsolutePath('@storybook/react-vite') as '@storybook/react-vite',
        options: {},
    },
    typescript: {
        reactDocgen: 'react-docgen-typescript',
    },
    viteFinal(config) {
        return {
            ...config,
            define: {
                ...config.define,
                'process.env': {}, // prevents Node.js polyfill errors in browser context
            },
        };
    },
};

export default config;

// REQUIRED in Rush/pnpm monorepos: resolves addon paths relative to
// the package that owns them, not the calling package.
function getAbsolutePath(value: string): string {
    return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}
```

> **⚠️ Rush/pnpm monorepo requirement**: You MUST use `getAbsolutePath()` for every addon and the
> framework. With hoisted installs the paths work without it, but with `pnpm` and
> `shamefully-hoist=false` (the Rush default) bare addon name strings silently resolve to wrong
> paths and Storybook fails to start. Always use `getAbsolutePath()`.
>
> **`framework` must be an object**: The `{name, options}` object form is required in v10. The bare
> string shorthand (`framework: '@storybook/react-vite'`) is a v8 convenience that no longer works.

### 4. Preview Configuration

Create `.storybook/preview.tsx` (use `.tsx` if decorators contain JSX):

```typescript
import type {Preview} from '@storybook/react';

const preview: Preview = {
    parameters: {
        layout: 'fullscreen',
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/,
            },
        },
    },
};

export default preview;
```

#### Wrapping stories in a context provider

If your components consume a React context (via a custom hook), wrap stories globally in the
provider using a decorator. Use a no-op dispatch so stories work without a real backend:

```tsx
// .storybook/preview.tsx
import type {Preview} from '@storybook/react';
import {MyProvider} from '../src/context/MyContext.js';

const noopDispatch = async (method: string, params?: unknown) => {
    console.info('[Storybook] dispatch:', method, params);
    return undefined;
};

const preview: Preview = {
    decorators: [
        Story => (
            <MyProvider dispatch={noopDispatch}>
                <Story />
            </MyProvider>
        ),
    ],
    parameters: {
        controls: {matchers: {color: /(background|color)$/i, date: /Date$/}},
    },
};

export default preview;
```

> **Note**: If the provider creates its own `QueryClient` or similar client internally, do NOT also
> wrap it in `<QueryClientProvider>` — that creates two clients and state won't be shared.

## Story Creation

### Basic Story Structure

> **⚠️ Every story file MUST have a default export** — a `Meta` object. Storybook uses it to
> discover and index stories. Files without a default export produce `CSF: missing default export`
> errors and are silently skipped.

**`StoryObj` format** (preferred for new stories):

```typescript
import type {Meta, StoryObj} from '@storybook/react';
import MyComponent from './MyComponent';

const meta: Meta<typeof MyComponent> = {
    title: 'Components/MyComponent',
    component: MyComponent,
};
export default meta; // ← required

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {label: 'Click me'},
};

export const Loading: Story = {
    args: {isLoading: true},
};
```

**Plain function format** (works in v10, compatible with custom `StoryFn` types):

```typescript
import type {Meta} from '@storybook/react';
import MyComponent from './MyComponent';

const meta: Meta<typeof MyComponent> = {
    title: 'Components/MyComponent',
    component: MyComponent,
};
export default meta;  // ← required even with plain function stories

export const Default = () => <MyComponent label="Click me" />;
export const Loading = () => <MyComponent isLoading />;
```

**Sub-story file** (stories split into separate files under a `stories/` folder):

```typescript
// stories/DetailView.stories.tsx
import type {Meta} from '@storybook/react';
import {MyComponent} from '../index.js';

const meta: Meta<typeof MyComponent> = {
    title: 'Components/MyComponent/DetailView',  // ← parent title + subpath
    component: MyComponent,
};
export default meta;

export const DetailView = () => <MyComponent view="detail" />;
```

> **Title convention**: The `title` determines placement in the sidebar tree.
> `'Editor/CascadedTables'` creates a `CascadedTables` node inside the `Editor` folder.

### Story with Interaction Tests

```typescript
export const UserInteraction: Story = {
    args: {
        onChange: () => console.log('changed'),
        label: 'Input field',
    },
    play: async ({canvasElement, step}) => {
        const canvas = within(canvasElement);

        await step('User clicks input', async () => {
            const input = canvas.getByRole('textbox');
            await userEvent.click(input);
        });

        await step('User types text', async () => {
            const input = canvas.getByRole('textbox');
            await userEvent.type(input, 'Hello World');
            expect(input).toHaveValue('Hello World');
        });

        await step('Submit button is enabled', async () => {
            const button = canvas.getByRole('button', {name: /submit/i});
            expect(button).toBeEnabled();
        });
    },
};
```

### Story with Mock Data

```typescript
export const WithMockedData: Story = {
  render: (args) => (
    <MockProvider initialData={sampleData}>
      <MyComponent {...args} />
    </MockProvider>
  ),
  args: {
    initialEntries: generateLargeDataset(100),
    config: {
      theme: 'dark',
      filters: ['level', 'service'],
    }
  },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('Data renders correctly', async () => {
      const rows = canvas.getAllByRole('row');
      expect(rows.length).toBeGreaterThan(10);
    });
  },
};
```

## Running Storybook

### Development Mode

```bash
# Start dev server with hot reload
npm run storybook

# Open browser to http://localhost:6006
```

### Testing Mode

```bash
# Run visual regression tests locally
npm run storybook:test

# Update snapshots after reviewing changes
npm run visual:update

# Run in CI/CD
npm run storybook:test:ci
```

## Advanced Topics

For detailed information on specific topics, see the reference files:

### Composition Patterns

For monorepo setups with multiple packages, see
[composition-patterns.md](references/composition-patterns.md):

- **Monorepo Composition**: Combine stories from multiple packages (recommended for Rush.js/Blong)
- **Storybook Composition Feature**: Link multiple running Storybook instances
- **Workspace Publishing**: Create dedicated stories package (advanced)

### Configuration Examples

For detailed configuration patterns, see
[configuration-examples.md](references/configuration-examples.md):

- **Mock Data Patterns**: Creating realistic test data
- **Snapshot Management**: Directory structure and update workflows
- **CI/CD Integration**: GitHub Actions setup and testing checklist
- **Accessibility Testing**: A11y addon configuration
- **Integration with Blong Monorepo**: Rush.js-specific setup

### Best Practices

For proven patterns and guidelines, see [best-practices.md](references/best-practices.md):

- **Story Naming Convention**: Clear, descriptive names
- **Snapshot Count Guidelines**: 15-25 stories per component
- **Mock Data Quality**: Realistic but controlled data
- **Test Selectors**: Semantic queries vs fragile selectors
- **Play Function Structure**: Organize with arrange/act/assert
- **Performance Considerations**: Large dataset handling

### Anti-Patterns and Troubleshooting

For common issues and solutions, see [troubleshooting.md](references/troubleshooting.md):

- **Common Anti-Patterns**: Python HTTP servers, missing interaction tests, real network calls,
  non-deterministic snapshots
- **Troubleshooting**: Snapshot issues, test timeouts, WebSocket mocking

## Resources

- **Storybook Docs**: https://storybook.js.org/docs
- **Interaction Testing**: https://storybook.js.org/docs/writing-tests/interaction-testing
- **Visual Regression**: https://storybook.js.org/docs/writing-tests/visual-testing
- **Component Driven**: https://componentdriven.org/
- **Testing Library**: https://testing-library.com/
- **Storybook Composition**: https://storybook.js.org/docs/sharing-stories-with-your-team

---

**Skill Version**: 1.1 **Last Updated**: 2026-04-03 **Requires**: Storybook v10+, React 18+,
TypeScript 5+, Vite
