# Storybook Interaction Testing Patterns

## Table of Contents

- [Pattern 1: Form Interaction](#pattern-1-form-interaction)
- [Pattern 2: Filtering/Search](#pattern-2-filteringsearch)
- [Pattern 3: Open/Close Modal or Expanded View](#pattern-3-openclose-modal-or-expanded-view)
- [Pattern 4: Real-Time Updates (WebSocket Simulation)](#pattern-4-real-time-updates-websocket-simulation)
- [Pattern 5: Keyboard Navigation](#pattern-5-keyboard-navigation)

## Pattern 1: Form Interaction

```typescript
export const SubmitFormFlow: Story = {
  args: {
    onSubmit: fn(),
  },
  play: async ({ canvasElement, step, args }) => {
    const canvas = within(canvasElement);

    // Step 1: Fill form
    await step('User fills in all fields', async () => {
      await userEvent.type(canvas.getByLabelText('Name'), 'John Doe');
      await userEvent.type(canvas.getByLabelText('Email'), 'john@example.com');
    });

    // Step 2: Submit
    await step('User submits form', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /submit/i }));
    });

    // Step 3: Verify
    await step('onSubmit callback fired', async () => {
      expect(args.onSubmit).toHaveBeenCalledWith({
        name: 'John Doe',
        email: 'john@example.com',
      });
    });
  },
};
```

## Pattern 2: Filtering/Search

```typescript
export const ApplyFilterAndSearch: Story = {
  args: {
    entries: generateLargeDataset(100),
  },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('User applies level filter', async () => {
      const levelButton = canvas.getByRole('button', { name: /level.*error/i });
      await userEvent.click(levelButton);
    });

    await step('Only error entries shown', async () => {
      const rows = canvas.getAllByRole('row');
      // Verify filter worked
      expect(rows.length).toBeLessThan(100); // Filtered down
      rows.forEach(row => {
        expect(row).toHaveTextContent(/ERROR/i);
      });
    });

    await step('User types search term', async () => {
      const searchBox = canvas.getByPlaceholderText('Search...');
      await userEvent.type(searchBox, 'connection', { delay: 50 });
    });

    await step('Search highlights match', async () => {
      const highlights = canvas.getAllByRole('mark');
      expect(highlights.length).toBeGreaterThan(0);
      highlights.forEach(mark => {
        expect(mark).toHaveTextContent(/connection/i);
      });
    });
  },
};
```

## Pattern 3: Open/Close Modal or Expanded View

```typescript
export const ExpandAndViewDetails: Story = {
  args: {
    entries: sampleEntries,
  },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('Modal not initially visible', async () => {
      expect(canvas.queryByRole('dialog')).not.toBeInTheDocument();
    });

    await step('User clicks expand button', async () => {
      const expandButton = canvas.getAllByRole('button', { name: /expand/i })[0];
      await userEvent.click(expandButton);
    });

    await step('Modal appears with details', async () => {
      const modal = canvas.getByRole('dialog');
      expect(modal).toBeInTheDocument();
      expect(modal).toHaveTextContent(/full details/i);
    });

    await step('User closes modal', async () => {
      const closeButton = canvas.getByRole('button', { name: /close/i });
      await userEvent.click(closeButton);
    });

    await step('Modal is hidden again', async () => {
      expect(canvas.queryByRole('dialog')).not.toBeInTheDocument();
    });
  },
};
```

## Pattern 4: Real-Time Updates (WebSocket Simulation)

```typescript
export const RecievesRealtimeUpdate: Story = {
  args: {
    entries: [],
  },
  play: async ({ canvasElement, step, args }) => {
    const canvas = within(canvasElement);

    await step('Component initialized empty', async () => {
      expect(canvas.getByText(/no entries/i)).toBeInTheDocument();
    });

    await step('New entry arrives', async () => {
      // Simulate WebSocket message
      const mockEntry = { id: '1', msg: 'New log entry' };
      // In a real scenario, trigger the update mechanism
      // For now, assume component has received update
    });

    await step('New entry visible in grid', async () => {
      const rows = canvas.getAllByRole('row');
      expect(rows.length).toBeGreaterThan(1);
      expect(canvas.getByText('New log entry')).toBeInTheDocument();
    });
  },
};
```

## Pattern 5: Keyboard Navigation

```typescript
export const KeyboardNavigation: Story = {
  args: {
    items: ['Option A', 'Option B', 'Option C'],
  },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('User presses Tab to focus dropdown', async () => {
      const dropdown = canvas.getByRole('combobox');
      await userEvent.tab();
      expect(dropdown).toHaveFocus();
    });

    await step('User presses ArrowDown to open', async () => {
      await userEvent.keyboard('{ArrowDown}');
      const listbox = canvas.getByRole('listbox', { hidden: false });
      expect(listbox).toBeVisible();
    });

    await step('User navigates with arrow keys', async () => {
      await userEvent.keyboard('{ArrowDown}');
      const secondOption = canvas.getByRole('option', { name: 'Option B' });
      expect(secondOption).toHaveAttribute('aria-selected', 'true');
    });

    await step('User confirms with Enter', async () => {
      await userEvent.keyboard('{Enter}');
      expect(canvas.getByDisplayValue('Option B')).toBeInTheDocument();
    });
  },
};
```
