---
name: storybook-v10-setup
description: Set up Storybook v10 for React/TypeScript component testing with visual regression testing, interaction tests, and CI/CD integration. Use when configuring Storybook for a new package, setting up snapshot testing, creating composition patterns for monorepos, or integrating with CI/CD pipelines. Supports Rush.js/Blong monorepo setups.
---

# Storybook v10 Component Testing

## Overview

Configure Storybook v10 for React/TypeScript component libraries with automatic screenshot and markup snapshots, following modern best practices for component testing and documentation.

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
        "@storybook/react": "^10.2.8",
        "@storybook/react-vite": "^10.2.8",
        "@storybook/addon-essentials": "^10.2.8",
        "@storybook/addon-interactions": "^10.2.8",
        "@storybook/addon-a11y": "^10.2.8",
        "@storybook/addon-links": "^10.2.8",
        "@storybook/test": "^10.2.8",
        "@storybook/test-runner": "^0.19.1",
        "@playwright/test": "^1.40.0",
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

### 3. Main Configuration

Create `.storybook/main.ts`:

```typescript
import type {StorybookConfig} from '@storybook/react-vite';

const config: StorybookConfig = {
    stories: ['../src/**/*.stories.tsx'],
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
};

export default config;
```

### 4. Preview Configuration

Create `.storybook/preview.ts`:

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
        docs: {
            source: {state: 'open'},
        },
    },
};

export default preview;
```

## Story Creation

### Basic Story Structure

```typescript
import type {Meta, StoryObj} from '@storybook/react';
import {expect, userEvent, within} from '@storybook/test';
import MyComponent from './MyComponent';

const meta = {
    title: 'Components/MyComponent',
    component: MyComponent,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
} satisfies Meta<typeof MyComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        label: 'Click me',
    },
};

export const Loading: Story = {
    args: {
        isLoading: true,
    },
};

export const Disabled: Story = {
    args: {
        disabled: true,
    },
};
```

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

For monorepo setups with multiple packages, see [composition-patterns.md](references/composition-patterns.md):

- **Monorepo Composition**: Combine stories from multiple packages (recommended for Rush.js/Blong)
- **Storybook Composition Feature**: Link multiple running Storybook instances
- **Workspace Publishing**: Create dedicated stories package (advanced)

### Configuration Examples

For detailed configuration patterns, see [configuration-examples.md](references/configuration-examples.md):

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

- **Common Anti-Patterns**: Python HTTP servers, missing interaction tests, real network calls, non-deterministic snapshots
- **Troubleshooting**: Snapshot issues, test timeouts, WebSocket mocking

## Resources

- **Storybook Docs**: https://storybook.js.org/docs
- **Interaction Testing**: https://storybook.js.org/docs/writing-tests/interaction-testing
- **Visual Regression**: https://storybook.js.org/docs/writing-tests/visual-testing
- **Component Driven**: https://componentdriven.org/
- **Testing Library**: https://testing-library.com/
- **Storybook Composition**: https://storybook.js.org/docs/sharing-stories-with-your-team

---

**Skill Version**: 1.0
**Last Updated**: 2026-02-14
**Requires**: Storybook v10+, React 18+, TypeScript 5+, Vite
