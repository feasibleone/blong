# Storybook Anti-Patterns and Troubleshooting

## Table of Contents

- [Common Anti-Patterns](#common-anti-patterns)
- [Troubleshooting](#troubleshooting)

## Common Anti-Patterns

### ❌ Anti-Pattern 1: Python HTTP Server

**WRONG:**

```bash
python3 -m http.server 6006
pkill -f "python3 -m http.server"
```

**RIGHT:**

```bash
npm run storybook:test:ci  # Uses http-server NPM package (already in scripts)
```

### ❌ Anti-Pattern 2: Missing Interaction Tests

**WRONG:** Only visual snapshots, no behavior verification

```typescript
export const FilteredView: Story = {
  args: { filter: 'errors' },
  // No play() function - can't verify filter actually works
};
```

**RIGHT:** Include interaction play() function

```typescript
export const FilteredView: Story = {
  args: { filter: 'errors' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /errors/i }));
    expect(canvas.getByText(/no errors/i)).toBeInTheDocument();
  },
};
```

### ❌ Anti-Pattern 3: Real Network Calls in Stories

**WRONG:**

```typescript
const [data, setData] = React.useState(null);
React.useEffect(() => {
  fetch('http://localhost:3000/api/data')
    .then(r => r.json())
    .then(setData);
}, []);
```

**RIGHT:**

```typescript
// Use mock decorator or provider
<MockApiProvider data={mockData}>
  <MyComponent />
</MockApiProvider>
```

### ❌ Anti-Pattern 4: Non-Deterministic Snapshots

**WRONG:**

```typescript
export const TimestampStory: Story = {
  args: {
    timestamp: Date.now(), // Changes every time!
  },
};
```

**RIGHT:**

```typescript
export const TimestampStory: Story = {
  args: {
    timestamp: 1708000000000, // Fixed timestamp
  },
};
```

### ❌ Anti-Pattern 5: Snapshots with Unstable Data

**WRONG:**

```typescript
Math.random() // Changes every render
uuid.v4()     // Different ID each time
new Date()    // Current time
```

**RIGHT:**

```typescript
// Use fixed seeds or mock libraries
import crypto from 'crypto';
const seed = Buffer.alloc(32);
seed.fill(42);
```

## Troubleshooting

### CSF: missing default export

**Symptom**: Storybook starts but shows `🚨 Unable to index files: ./src/SomeComponent.stories.tsx: CSF: missing default export`. The file's stories never appear in the sidebar.

**Cause**: Every story file must export a `Meta` object as the default export. Storybook uses it to index and categorize stories. Files without it are silently skipped.

**Fix**: Add a `Meta` default export after your imports:

```typescript
import type {Meta} from '@storybook/react';
import {MyComponent} from './index.js';

const meta: Meta<typeof MyComponent> = {
    title: 'Section/MyComponent',
    component: MyComponent,
};
export default meta;  // ← add this

export const MyStory = () => <MyComponent />;
```

---

### Version mismatch: storybook core vs addons

**Symptom**: `pnpm install` or Storybook startup fails with peer dependency errors or incompatible API errors about missing named exports.

**Cause**: Mixing Storybook v10 core (`storybook@10.x`) with v8-era addon packages (`@storybook/addon-essentials@8.x`, `@storybook/addon-interactions@8.x`, `@storybook/test@8.x`).

**Fix**: Use ONLY these packages in v10 — all pinned to the same minor:

```json
{
    "storybook": "^10.2.14",
    "@storybook/react": "^10.2.14",
    "@storybook/react-vite": "^10.2.14",
    "@storybook/addon-a11y": "^10.2.14",
    "@storybook/addon-docs": "^10.2.14",
    "@storybook/test-runner": "^0.24.2"
}
```

Remove: `addon-essentials`, `addon-interactions`, `addon-links`, `@storybook/test`, `@chromatic-com/storybook@3.x` (Chromatic v3 only supports Storybook v8).

---

### Addon resolution fails in Rush/pnpm monorepo

**Symptom**: `Cannot find module '@storybook/addon-a11y'` or Storybook starts but addons are missing/broken.

**Cause**: With pnpm's non-hoisted node_modules, bare string addon names in `addons: [...]` and `framework: '...'` resolve relative to the calling package and fail when the package lives in a different part of the monorepo's symlink tree.

**Fix**: Use the `getAbsolutePath()` helper to resolve addon paths at startup:

```typescript
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

function getAbsolutePath(value: string): string {
    return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}

const config: StorybookConfig = {
    addons: [
        getAbsolutePath('@storybook/addon-a11y'),
        getAbsolutePath('@storybook/addon-docs'),
    ],
    framework: {
        name: getAbsolutePath('@storybook/react-vite') as '@storybook/react-vite',
        options: {},
    },
};
```

---

### `process.env` / `process is not defined` crash in Vite

**Symptom**: Storybook starts but immediately crashes in the browser with `ReferenceError: process is not defined`, or Vite build fails with polyfill errors.

**Cause**: Some packages reference `process.env.NODE_ENV` or similar Node.js globals that don't exist in browser context. Vite doesn't polyfill `process` by default.

**Fix**: Add `viteFinal` to `main.ts` to define the global:

```typescript
viteFinal(config) {
    return {
        ...config,
        define: {
            ...config.define,
            'process.env': {},
        },
    };
},
```

---

### 403 Forbidden for fonts/assets from pnpm virtual store

**Symptom**: Browser console shows `403 Forbidden` for a font or asset URL like:

```
http://localhost:6006/@fs/home/.../common/temp/node_modules/.pnpm/primeicons@6.0.1/node_modules/primeicons/fonts/primeicons.woff
```

**Cause**: Vite's dev server filesystem security (`server.fs.allow`) only permits files within the project root by default. In a Rush monorepo, packages like `primeicons` resolve through the pnpm virtual store at `common/temp/node_modules/.pnpm/...`, which is outside the `blong-browser` package root.

**Fix**: Add `server.fs.allow` in `viteFinal` in `.storybook/main.ts`:

```typescript
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

viteFinal(config) {
    return {
        ...config,
        server: {
            ...config.server,
            fs: {
                allow: [
                    '..', // project root
                    resolve(__dirname, '../../../common/temp/node_modules'),
                ],
            },
        },
    };
},
```

`__dirname` here is the `.storybook/` folder. Count levels up carefully:

| From | To |
|------|----|
| `.storybook/` | package root (`../`) |
| package root | `core/` (`../../`) |
| `core/` | monorepo root (`../../../`) |

So from `.storybook/main.ts`, `../../../common/temp/node_modules` reaches `<monorepo-root>/common/temp/node_modules`. Adjust if your package is nested differently.

---

### Snapshots Not Updating

```bash
# Check for typos in snapshot names
ls src/**/__image_snapshots__/

# Force clean rebuild
rm -rf node_modules/.cache
npm run storybook:test -- --updateSnapshot

# Check Playwright configuration
npx playwright install
```

### Tests Timeout

```bash
# Increase timeout in playwright.config.ts
use: {
  navigationTimeout: 10000,
  actionTimeout: 10000,
}
```

### WebSocket Mocking Issues

```typescript
// Use in story decorator
React.useEffect(() => {
  const OriginalWS = window.WebSocket;
  window.WebSocket = MockWebSocket;
  return () => { window.WebSocket = OriginalWS; };
}, []);
```
