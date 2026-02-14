---
name: storybook-testing-workflow
description: Daily Storybook development workflow and testing patterns. Use when developing components in Storybook, writing play() functions, debugging interactions, running tests, or ensuring accessibility. For initial setup and configuration, see storybook-v10-setup skill.
---

# Storybook Effective Usage & Development Workflow

## Overview

Use Storybook v10+ as a development tool for building, testing, and validating React components. This skill emphasizes using Storybook's interaction testing capabilities, proper testing workflows, and avoiding common pitfalls.

**For initial setup and configuration,** see **storybook-v10-setup** skill.

**Key Focus**: Move from "create stories in Storybook" to "develop and validate components IN Storybook"

## Mental Model Shift

❌ **Old Mindset**:

> Storybook = screenshot tool for documentation

✅ **New Mindset**:

> Storybook = integrated dev + test environment for components
>
> - Rapid iteration (hot reload on every change)
> - Isolated testing (no app complexity)
> - Automated behavior validation (play functions)
> - Visual regression detection (snapshot tests)
> - Accessibility checking (a11y scans)

## Development Workflow

```
┌─────────────────────────────────────────────────────────────┐
│ Typical Component Development Session in Storybook          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Start: npm run storybook (dev server, port 6006)           │
│                                                              │
│  Loop (repeat 4-8 times):                                   │
│  ├─ Add/modify story or component code                      │
│  ├─ Sees hot-reload in browser (< 100ms)                    │
│  ├─ Inspect visual changes in Story tab                     │
│  ├─ Click "Interactions" tab to see play() steps            │
│  ├─ Verify accessibility in "A11y" tab                      │
│  ├─ Review "Docs" tab for generated documentation           │
│  └─ If issue found, go to source and repeat                │
│                                                              │
│  Validate: npm run storybook:test (local)                   │
│  ├─ Detects visual regressions                              │
│  ├─ Runs all play() functions                               │
│  └─ Fails on assertion errors                               │
│                                                              │
│  Commit: Visual snapshots already approved                  │
│  ├─ git add src/**/__*_snapshots__/                         │
│  └─ Snapshots are part of code review                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Core Concept: The Play Function

A play function is a test script that runs automatically when you view a story in Storybook. It simulates user interactions and verifies component behavior.

```typescript
// A play function runs whenever this story is viewed
export const UserClicksButton: Story = {
    play: async ({canvasElement, step}) => {
        const canvas = within(canvasElement);

        await step('User clicks button', async () => {
            const button = canvas.getByRole('button');
            await userEvent.click(button);
            expect(button).toHaveAttribute('aria-pressed', 'true');
        });
    },
};
```

### Why Play Functions Matter

Play functions solve a critical problem:

**Without Play Functions:**

```typescript
export const FilteredView: Story = {
    args: {data: filteredData},
    // ❌ Only shows the RESULT, not HOW it got there
    // ❌ Can't verify filter actually WORKS
    // ❌ Doesn't test user interactions
};
```

**With Play Functions:**

```typescript
export const UserAppliesFilter: Story = {
    args: {data: allData},
    play: async ({canvasElement, step}) => {
        const canvas = within(canvasElement);

        await step('User clicks filter button', async () => {
            await userEvent.click(canvas.getByRole('button', {name: /filter/i}));
        });

        await step('Only filtered entries shown', async () => {
            const rows = canvas.getAllByRole('row');
            expect(rows.length).toBeLessThan(allData.length); // PROVES it filtered
        });
    },
};
// ✅ PROVES the feature works, not just shows the result
```

## Browser Developer Tools Integration

### Viewing Play Function Steps

1. Open Story in Storybook
2. Click "Interactions" tab (below story preview)
3. Each `await step()` call shows as expandable item
4. Click step to see what was tested
5. Hover to highlight affected elements

Example Output:

```
▼ UserAppliesFilter
  ▼ User opens filter dropdown
    ✓ Clicked combobox[aria-haspopup="listbox"]
  ▼ User selects "errors only"
    ✓ Clicked option[id="errors"]
  ▼ Grid shows only error rows
    ✓ Assertion passed: rows.length > 0
```

### Inspecting Snapshots

1. Open "Assets" tab in Storybook
2. View both visual and markup snapshots
3. Compare against previous commits to see what changed

### Accessibility Testing

1. Click "A11y" tab
2. Storybook automatically runs accessibility checks (WCAG AA/AAA, ARIA, semantic HTML, keyboard navigation)
3. Fix as indicated - story can't be approved with A11y violations

## No More Python HTTP Server Anti-Pattern

### ❌ WRONG: Manual Python Server

```bash
# DON'T DO THIS:
python3 -m http.server 6006 &
npm run storybook:test
pkill -f "python3 -m http.server"
```

**Problems**: External to Node.js, manual process killing, can't integrate into CI/CD, port conflicts hard to debug

### ✅ RIGHT: Use CI Script Already in package.json

```bash
# DO THIS INSTEAD:
npm run storybook:test:ci

# What it does:
# 1. npm run storybook:build        → Generate static
# 2. npx http-server static --port → Serve with Node package
# 3. npm run storybook:test --url   → Run tests headless
# 4. Exit code indicates pass/fail
```

**Benefits**: All Node.js tools, automatic cleanup, perfect for CI/CD, easy to troubleshoot, reproducible everywhere

## When NOT to Use Storybook

- ❌ Testing server-side logic (use Jest/TAP)
- ❌ Testing database interactions (use integration tests)
- ❌ Testing full application workflows (use E2E tests)
- ❌ Testing third-party library behavior
- ❌ Performance benchmarking (use dedicated load testing)

**RIGHT SCOPE**: Component-level rendering, interaction, and visual behavior

## Advanced Topics

For detailed implementation patterns and examples, see the reference files:

### Interaction Testing Patterns

See [interaction-patterns.md](references/interaction-patterns.md) for complete examples:

- **Pattern 1: Form Interaction** - Fill forms, submit, verify callbacks
- **Pattern 2: Filtering/Search** - Apply filters, search, verify highlighting
- **Pattern 3: Open/Close Modal** - Toggle visibility, verify content
- **Pattern 4: Real-Time Updates** - Simulate WebSocket messages
- **Pattern 5: Keyboard Navigation** - Tab, arrows, Enter interactions

### Development Workflow Scenarios

See [development-scenarios.md](references/development-scenarios.md) for step-by-step workflows:

- **Scenario 1: Building a New Component** - From basic rendering to interaction tests
- **Scenario 2: Fixing a Bug** - Use play functions to reproduce and verify fixes
- **Scenario 3: Adding New Feature** - Cover feature with comprehensive tests

### Testing Checklist

See [testing-checklist.md](references/testing-checklist.md) for comprehensive checklists:

- **Component Testing Checklist Template** - Use for any component
- **LogViewer Example Checklist** - Complete example with all feature categories

### Common Development Patterns

See [common-patterns.md](references/common-patterns.md) for reusable patterns:

- **Pattern A: Debugging with Console** - Use console.log in play() functions
- **Pattern B: Testing with Different Props** - Factory functions for variations
- **Pattern C: Testing Error Scenarios** - Graceful error handling
- **Pattern D: Testing WebSocket Lifecycle** - Connection/reconnection flows

## Troubleshooting

### Play Function Not Running

**Problem**: Story loads but Interactions tab empty

**Solution**:

1. Add explicit play() function to story
2. Check syntax: `play: async ({ canvasElement, step }) => { ... }`
3. Ensure step() calls wrap each block
4. Open browser console for error messages

### Snapshot Tests Failing Incorrectly

**Problem**: Tests fail but changes look correct

**Solution**:

1. Review diff in `__diff_output__/` directory
2. If change is intentional: `npm run visual:update`
3. If change is bug: Fix component code and retry
4. Never commit snapshot without review

### WebSocket Mock Not Working

**Problem**: Component can't connect in Storybook

**Solution**:

1. Mock WebSocket in story decorator
2. Use MockProvider wrapper component
3. Dispatch mock messages in play() function
4. Never try real WebSocket in Storybook

### Large Dataset Performance

**Problem**: 10k entries story is slow

**Solution**:

1. Keep datasets < 1000 for interaction tests
2. Use separate "PerformanceTest" story with 10k
3. Disable auto-play: `parameters: { play: { autoplay: false } }`
4. Use Playwright performance API to measure

## Key Takeaways

1. **Play functions are assertions**: Every story should have a `play()` function that tests user scenarios
2. **No external servers**: Use `npm run storybook:test:ci`, never `python3 -m http.server`
3. **Storybook = dev environment**: Use it actively during development, not just documentation
4. **Step annotations help debugging**: Every `await step()` appears in Interactions tab
5. **Snapshots are version control**: Commit visual + markup snapshots as part of feature
6. **Tests must pass before commit**: Run `npm run storybook:test` locally before pushing
7. **Mock all external state**: WebSocket, HTTP, time - everything mocked in Storybook
8. **Accessibility matters**: Run A11y tab before approving, fix violations immediately

## Resources

- **Storybook Interaction Testing**: https://storybook.js.org/docs/writing-tests/interaction-testing
- **Testing Library (userEvent)**: https://testing-library.com/
- **Playwright (screenshot runner)**: https://playwright.dev/
- **Storybook Testing Blog**: https://storybook.js.org/blog/storybook-test-8-0/
