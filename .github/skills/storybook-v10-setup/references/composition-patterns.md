# Storybook Composition Patterns

For projects with multiple packages containing stories, Storybook provides several composition strategies.

## Table of Contents

- [Monorepo Composition (Recommended)](#monorepo-composition-recommended-for-rushjs--blong)
- [Storybook Composition Feature (Multiple Instances)](#storybook-composition-feature-multiple-running-instances)
- [Workspace Publishing (Advanced)](#workspace-publishing-advanced)

## Monorepo Composition (Recommended for Rush.js / Blong)

Combine stories from multiple packages into a single Storybook instance:

```typescript
// blong-log/.storybook/main.ts
import type { StorybookConfig } from '@storybook/react-vite';
import path from 'path';

const config: StorybookConfig = {
  stories: [
    // Local package stories
    '../src/**/*.stories.tsx',

    // Other core packages (referenced by workspace path)
    '../../core/blong-rest/src/**/*.stories.tsx',
    '../../core/blong-login/src/**/*.stories.tsx',
    '../../core/blong-kopi/src/**/*.stories.tsx',

    // Extensions
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

  docs: {
    autodocs: 'tag',
  },

  // Ensure modules can be resolved from other packages
  webpackFinal: async (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@feasibleone/blong-log': path.resolve(__dirname, '../src'),
      '@feasibleone/blong-rest': path.resolve(__dirname, '../../core/blong-rest/src'),
      '@feasibleone/blong-login': path.resolve(__dirname, '../../core/blong-login/src'),
    };
    return config;
  },
};

export default config;
```

**Benefits**:

- ✅ Single Storybook instance for all packages
- ✅ Unified theming and styling
- ✅ Cross-package component interactions testable
- ✅ One dev server (port 6006)

**Directory Structure**:

```
blong/
├── core/
│   ├── blong-log/
│   │   ├── src/client/LogViewer.stories.tsx
│   │   └── .storybook/ ← Master Storybook here
│   ├── blong-rest/
│   │   └── src/API.stories.tsx
│   └── blong-login/
│       └── src/LoginForm.stories.tsx
└── ext/
    └── rest-fs/
        └── src/Explorer.stories.tsx
```

**Story Organization with Titles**:

Organize stories with package prefixes for clear navigation:

```typescript
// blong-log/src/client/LogViewer.stories.tsx
const meta = {
  title: 'Packages/blong-log/LogViewer',  // ← Package hierarchy
  component: LogViewer,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof LogViewer>;

// blong-rest/src/API.stories.tsx
const meta = {
  title: 'Packages/blong-rest/RestAPI',   // ← Different package
  component: RestAPI,
} satisfies Meta<typeof RestAPI>;

// blong-login/src/LoginForm.stories.tsx
const meta = {
  title: 'Packages/blong-login/LoginForm',  // ← Another package
  component: LoginForm,
} satisfies Meta<typeof LoginForm>;
```

**Resulting Navigation** (Storybook sidebar):

```
Packages
├─ blong-log
│  ├─ LogViewer
│  │  ├─ Default
│  │  ├─ Dark Theme
│  │  └─ With Search
├─ blong-rest
│  ├─ RestAPI
│  │  ├─ GET Request
│  │  ├─ POST Request
│  │  └─ Error Handling
├─ blong-login
│  ├─ LoginForm
│  │  ├─ Empty
│  │  ├─ With Error
│  │  └─ Success
└─ rest-fs
   ├─ Explorer
   │  ├─ Empty Directory
   │  └─ With Files
```

---

## Storybook Composition Feature (Multiple Running Instances)

Link multiple independently-running Storybook instances into one dashboard:

```typescript
// Master Storybook config
// master/.storybook/main.ts
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: [],  // Empty - using composition only

  addons: [
    '@storybook/addon-links',
    '@storybook/addon-essentials',
  ],

  // ← NEW: Composition configuration
  refs: {
    'LogViewer': {
      title: 'blong-log',
      url: 'http://localhost:6006',  // Dev
      // url: 'https://blong-log-storybook.example.com',  // Production
    },
    'REST API': {
      title: 'blong-rest',
      url: 'http://localhost:6007',  // Different port
    },
    'Auth': {
      title: 'blong-login',
      url: 'http://localhost:6008',  // Different port
    },
  },

  framework: '@storybook/react-vite',
};

export default config;
```

**Setup**: Start multiple Storybooks on different ports:

```bash
# Terminal 1
cd core/blong-log && npm run storybook  # Port 6006

# Terminal 2
cd core/blong-rest && npm run storybook  # Port 6007

# Terminal 3
cd core/blong-login && npm run storybook  # Port 6008

# Terminal 4: Run master Storybook
cd master && npm run storybook  # Port 6009
```

**Benefits**:

- ✅ Each package maintains independent story control
- ✅ Works across repositories (can use production URLs)
- ✅ Useful for distributed teams

**Drawbacks**:

- ⚠️ Multiple dev servers to manage
- ⚠️ More complex CI/CD setup

---

## Workspace Publishing (Advanced)

Create a dedicated stories package that exports all stories:

```typescript
// packages/stories/package.json
{
  "name": "@feasibleone/storybook-stories",
  "exports": {
    "./log": "./src/log/index.ts",
    "./rest": "./src/rest/index.ts",
    "./auth": "./src/auth/index.ts"
  }
}

// packages/stories/src/log/index.ts
export * as LogViewerStories from '@feasibleone/blong-log/LogViewer.stories';

// packages/stories/src/rest/index.ts
export * as RestAPIStories from '@feasibleone/blong-rest/API.stories';
```

Then import in consumer:

```typescript
// .storybook/main.ts
import { LogViewerStories, RestAPIStories } from '@feasibleone/storybook-stories';

// Stories accessible through package
```

**Use when**: Managing stories across many services or publishing a design system.
