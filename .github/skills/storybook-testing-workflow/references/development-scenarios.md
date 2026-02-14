# Development Workflow Scenarios

## Table of Contents

- [Scenario 1: Building a New Component](#scenario-1-building-a-new-component)
- [Scenario 2: Fixing a Bug Detected by a Play Function](#scenario-2-fixing-a-bug-detected-by-a-play-function)
- [Scenario 3: Adding New Feature and Covering with Tests](#scenario-3-adding-new-feature-and-covering-with-tests)

## Scenario 1: Building a New Component

```typescript
// Step 1: Create story with basic rendering
export const Default: Story = {};

// Step 2: Add play function stub
export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('Component renders', async () => {
      expect(canvas.getByText(/component title/i)).toBeInTheDocument();
    });
  },
};

// Step 3: Add interaction testing
export const UserInteracts: Story = {
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('User clicks button', async () => {
      await userEvent.click(canvas.getByRole('button'));
    });

    await step('State updates', async () => {
      expect(canvas.getByText(/updated text/i)).toBeInTheDocument();
    });
  },
};

// Step 4: Run in browser
// npm run storybook
// Open http://localhost:6006
// Click "Interactions" tab - see play() executing

// Step 5: Verify locally
// npm run storybook:test
// Fixes any failing assertions

// Step 6: Commit with snapshots
// git add src/**/__*_snapshots__/
// Snapshots prove visual appearance is correct
```

## Scenario 2: Fixing a Bug Detected by a Play Function

**Bug Found**: Filter shows "no matching entries" even when data exists

```typescript
// Current story shows the bug
export const FilterShowsNoResults: Story = {
  args: { entries: sampleEntries },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('User applies filter', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /error/i }));
    });

    // ❌ This fails - rows should exist
    await step('Filtered entries should display', async () => {
      const rows = canvas.getAllByRole('row');
      expect(rows.length).toBeGreaterThan(1); // FAILS!
    });
  },
};
```

**Fix Process**:

1. Open component source: `src/LogViewer.tsx`
2. Inspect filter logic - find the bug
3. See hot reload in Storybook
4. Re-run play function automatically
5. When play() passes, bug is fixed

**Key Benefit**: Never need to start app server, wait for build, navigate to page, manually trigger filter. Just edit code and see Storybook re-run the play() function instantly.

## Scenario 3: Adding New Feature and Covering with Tests

**Feature**: Click to open trace details in side panel

```typescript
// Story 1: Panel starts closed
export const TracePanel: Story = {
  args: { entries: sampleEntries },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('Trace panel is hidden initially', async () => {
      expect(canvas.queryByRole('complementary')).not.toBeInTheDocument();
    });
  },
};

// Story 2: Opening panel works
export const OpenTracePanel: Story = {
  args: { entries: sampleEntries },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('User clicks trace ID link icon', async () => {
      const traceLink = canvas.getAllByRole('link', { name: /trace/i })[0];
      // Note: link icon, separate from filter icon
      await userEvent.click(traceLink);
    });

    await step('Side panel opens with trace details', async () => {
      const panel = canvas.getByRole('complementary');
      expect(panel).toBeVisible();
      expect(panel).toHaveTextContent(/trace details/i);
    });
  },
};

// Story 3: Closing panel works
export const CloseTracePanel: Story = {
  args: { entries: sampleEntries },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    // Precondition: Panel already open
    const traceLink = canvas.getAllByRole('link', { name: /trace/i })[0];
    await userEvent.click(traceLink);

    await step('User clicks close button', async () => {
      const closeButton = canvas.getByRole('button', { name: /close.*panel/i });
      await userEvent.click(closeButton);
    });

    await step('Panel closes', async () => {
      expect(canvas.queryByRole('complementary')).not.toBeInTheDocument();
    });
  },
};
```

**Test Locally**:

```bash
npm run storybook:test
# ✓ TracePanel
# ✓ OpenTracePanel
# ✓ CloseTracePanel
```

All three behaviors pass = feature is ready for review.
