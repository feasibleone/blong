# Common Development Patterns

## Table of Contents

- [Pattern A: Debugging with Console in Play()](#pattern-a-debugging-with-console-in-play)
- [Pattern B: Testing with Different Props](#pattern-b-testing-with-different-props)
- [Pattern C: Testing Error Scenarios](#pattern-c-testing-error-scenarios)
- [Pattern D: Testing WebSocket Lifecycle](#pattern-d-testing-websocket-lifecycle)

## Pattern A: Debugging with Console in Play()

```typescript
export const DebugStory: Story = {
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('Debug: Check DOM state', async () => {
      const grid = canvas.getByRole('grid');
      console.table({
        gridVisible: grid.offsetHeight > 0,
        rowCount: canvas.getAllByRole('row').length,
        filterActive: canvas.getByText(/filter.*active/i) ? true : false,
      });

      // Inspect full grid HTML
      console.log(grid.outerHTML);
    });
  },
};
```

Open browser DevTools console while viewing story - logs appear there immediately.

## Pattern B: Testing with Different Props

```typescript
// Create factory function
const createStory = (args: Partial<typeof LogViewer.args> = {}) => ({
  args: {
    entries: sampleEntries,
    ...args,
  },
});

export const DarkTheme = createStory({ theme: 'dark' });
export const LightTheme = createStory({ theme: 'light' });
export const DisabledFilter = createStory({ filterDisabled: true });

// Each story has same structure but different args
// Reduces copy-paste
```

## Pattern C: Testing Error Scenarios

```typescript
export const HandleInvalidFilter: Story = {
  args: {
    entries: sampleEntries,
  },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('Component handles invalid filter gracefully', async () => {
      // Simulate invalid filter (e.g., null traceId)
      const filterButton = canvas.getByRole('button', { name: /filter/i });

      // Try to apply filter with invalid data
      await userEvent.click(filterButton);

      // Component should show error, not crash
      expect(canvas.queryByText(/error/i)).toBeInTheDocument();
      expect(canvas.queryByRole('grid')).toBeInTheDocument(); // Still visible
    });
  },
};
```

## Pattern D: Testing WebSocket Lifecycle

```typescript
export const WebSocketReconnection: Story = {
  args: { autoReconnect: true },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('WebSocket connected status shown', async () => {
      expect(canvas.getByText(/connected/i)).toBeInTheDocument();
    });

    await step('Simulate disconnect', async () => {
      // This would trigger the mock WebSocket close()
      // Component should show "disconnected" state
      expect(canvas.getByText(/reconnecting/i)).toBeInTheDocument();
    });

    await step('Component auto-reconnects', async () => {
      // Wait for reconnection timeout
      await waitFor(
        () => expect(canvas.getByText(/connected/i)).toBeInTheDocument(),
        { timeout: 5000 }
      );
    });
  },
};
```
