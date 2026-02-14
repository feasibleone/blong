# Storybook Configuration Examples

## Table of Contents

- [Mock Data Patterns](#mock-data-patterns)
- [Snapshot Management](#snapshot-management)
- [CI/CD Integration](#cicd-integration)
- [Accessibility Testing](#accessibility-testing)
- [Integration with Blong Monorepo](#integration-with-blong-monorepo)

## Mock Data Patterns

### Mock Fixtures File (`__fixtures__/data.ts`)

```typescript
import type { LogEntry, ClientConfig } from '../types';

export const sampleEntries: LogEntry[] = [
  {
    id: '1',
    timestamp: Date.now() - 10000,
    level: 30,
    levelName: 'INFO',
    msg: 'Application started',
    service: 'api-gateway',
  },
  {
    id: '2',
    timestamp: Date.now() - 5000,
    level: 50,
    levelName: 'ERROR',
    msg: 'Database connection failed',
    service: 'auth-service',
    error: {
      message: 'ECONNREFUSED 127.0.0.1:5432',
      stack: '...',
    },
  },
];

export const errorEntries: LogEntry[] = sampleEntries.filter(e => e.level >= 40);

export const generateLargeDataset = (count: number): LogEntry[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `${i}`,
    timestamp: Date.now() - (count - i) * 1000,
    level: [20, 30, 40, 50][i % 4],
    msg: `Log entry ${i}`,
    service: ['auth', 'api', 'db'][i % 3],
  }));
};

export const darkThemeConfig: ClientConfig = {
  theme: 'dark',
  colors: {
    background: '#1e1e1e',
    text: '#e0e0e0',
  },
};

export const lightThemeConfig: ClientConfig = {
  theme: 'light',
  colors: {
    background: '#ffffff',
    text: '#000000',
  },
};
```

## Snapshot Management

### Directory Structure

```
src/
├── Component.tsx
├── Component.stories.tsx
├── __fixtures__/
│   ├── data.ts              # Mock data for stories
│   └── mocks.ts             # Mocking utilities
├── __image_snapshots__/
│   ├── component--default.png
│   ├── component--loading.png
│   └── [... one per story ...]
└── __markup_snapshots__/
    ├── component--default.json
    ├── component--loading.json
    └── [... one per story ...]
```

### Snapshot Update Workflow

**Local Development:**

```bash
# Run stories and see visual differences
npm run storybook
# (Manual verification in browser at http://localhost:6006)

# Review changes, then update locally
npm run visual:update
```

**CI/CD Pipeline:**

```bash
# Build Storybook static
npm run storybook:build

# Run tests headless (auto-screenshotted vs baseline)
npm run storybook:test

# On feature branch, only fails + shows diff
# (Does NOT allow --updateSnapshot)

# On main/merge, update is reviewed + committed
npm run visual:update
git add src/**/__*_snapshots__/
git commit -m "chore: update snapshots"
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Storybook Tests

on: [push, pull_request]

jobs:
  storybook-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm install

      # Build Storybook static site
      - run: npm run storybook:build

      # Run visual regression tests
      - run: npx --yes http-server storybook-static --port 6006 --silent &
      - run: sleep 2
      - run: npm run storybook:test

      # Upload diff images if tests fail
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: storybook-diffs
          path: __diff_output__/
```

### Testing CI/CD Checklist

- [ ] Storybook builds successfully: `npm run storybook:build`
- [ ] Tests pass headless: `npm run storybook:test`
- [ ] No manual HTTP servers required
- [ ] Snapshots committed to git
- [ ] All stories export metadata (title, description)
- [ ] play() functions have step() annotations
- [ ] Large dataset stories skip unnecessary addons
- [ ] Mocked data is in `__fixtures__` directory
- [ ] No real API calls in stories
- [ ] Accessible selectors used (role, label, placeholder)

## Accessibility Testing

### A11y Addon Integration

The `@storybook/addon-a11y` addon is automatically integrated. Stories are checked automatically for:

- Color contrast
- ARIA attributes
- Semantic HTML
- Keyboard navigation

### Explicit A11y Story

```typescript
export const AccessibilityTest: Story = {
  args: {
    label: 'Accessible button',
  },
  parameters: {
    a11y: {
      config: {
        rules: [
          {
            id: 'color-contrast',
            enabled: true,
          },
        ],
      },
    },
  },
};
```

## Integration with Blong Monorepo

For Blong projects using Rush.js workspaces, follow the Monorepo Composition pattern.

### Setup Steps

**1. Install Storybook in blong-log (or designated package)**

```bash
cd core/blong-log
npx -y storybook@latest init --type react --builder vite
```

**2. Update .storybook/main.ts**

```typescript
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: [
    '../src/**/*.stories.tsx',
    '../../core/blong-rest/src/**/*.stories.tsx',
    '../../core/blong-login/src/**/*.stories.tsx',
    '../../ext/rest-fs/src/**/*.stories.tsx',
  ],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-a11y',
    '@storybook/addon-docs',
  ],
  framework: '@storybook/react-vite',
  docs: { autodocs: 'tag' },
};

export default config;
```

**3. Add npm scripts to all referenced packages**

```json
// In core/blong-log/package.json
{
  "scripts": {
    "storybook": "storybook dev -p 6006",
    "storybook:build": "storybook build -o storybook-static",
    "storybook:test": "test-storybook",
    "storybook:test:ci": "storybook build -o storybook-static && test-storybook --url http://127.0.0.1:6006",
    "visual:update": "npm run storybook:test -- --updateSnapshot"
  }
}
```

**4. Update .storybook/preview.ts for Blong theming**

```typescript
import type { Preview } from '@storybook/react';

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    docs: {
      source: { state: 'open' },
    },
  },
  decorators: [
    (Story) => (
      <div style={{
        background: '#ffffff',
        padding: '1rem',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <Story />
      </div>
    ),
  ],
};

export default preview;
```

### Organization for Blong

Use title hierarchy reflecting Blong package structure:

```typescript
// blong-log stories
export const meta = {
  title: 'Framework/blong-log/LogViewer',
};

// blong-rest stories
export const meta = {
  title: 'Framework/blong-rest/RestAPI',
};

// Example: blong-realm component
export const meta = {
  title: 'Framework/blong/Realm',
};

// Example: custom adapter UI
export const meta = {
  title: 'Framework/blong-adapter/HttpAdapter',
};
```

**Resulting Storybook Navigation**:

```
Framework
├─ blong
│  ├─ Realm
│  │  ├─ Default
│  │  └─ With Handlers
├─ blong-log
│  ├─ LogViewer
│  │  ├─ Empty
│  │  ├─ With Entries
│  │  └─ Large Dataset
├─ blong-rest
│  ├─ RestAPI
│  │  ├─ GET Request
│  │  └─ POST Request
├─ blong-login
│  ├─ LoginForm
│  │  ├─ Default
│  │  └─ With Error
└─ rest-fs
   ├─ FileExplorer
      ├─ Empty
      └─ With Files
```

### Running in Blong

**Development**:

```bash
# Start Storybook dev server with hot reload
npm run storybook

# Open browser to http://localhost:6006
# Navigate through all package stories
# Edit any component, see hot reload instantly
```

**Testing Locally**:

```bash
# Run visual regression tests
npm run storybook:test

# All snapshots from all packages tested
# See diffs in __diff_output__/
```

### Best Practices for Blong Components

1. **Keep stories in src/client/**: Stories live near components
2. **Use Blong patterns**: Follow handler/adapter/orchestrator patterns
3. **Mock Blong services**: Mock WebSocket, REST, and other integrations
4. **Test realm interactions**: Use play() to test cross-realm communication
5. **Document configuration**: Put complex config examples in stories
