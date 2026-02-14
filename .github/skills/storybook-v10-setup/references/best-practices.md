# Storybook Best Practices

## Table of Contents

- [Story Naming Convention](#story-naming-convention)
- [Snapshot Count Guidelines](#snapshot-count-guidelines)
- [Mock Data Quality](#mock-data-quality)
- [Test Selectors](#test-selectors)
- [Play Function Structure](#play-function-structure)
- [Performance Considerations](#performance-considerations)

## Story Naming Convention

```typescript
// ✅ GOOD: Clear, descriptive names
export const Default: Story = { /* ... */ };
export const WithErrors: Story = { /* ... */ };
export const LargeDataset: Story = { /* ... */ };
export const DarkTheme: Story = { /* ... */ };
export const UserFiltersData: Story = { /* ... */ };

// ❌ BAD: Vague or generic
export const Story1: Story = { /* ... */ };
export const Test: Story = { /* ... */ };
```

## Snapshot Count Guidelines

Aim for **15-25 stories** capturing:

- Default/normal state (1)
- Themed variations: dark, light, custom (3)
- State variations: loading, error, empty, success (4)
- Data variations: small dataset, large (1000+), edge cases (3)
- User interactions: filtered, searched, sorted (3)
- Accessibility variants: focus, disabled, ARIA (2)
- Responsive/layout variants: mobile, tablet, desktop (3)

## Mock Data Quality

```typescript
// ✅ GOOD: Realistic but controlled data
const mockEntries = generateEntries({
  count: 100,
  errorRate: 0.1,
  services: ['auth', 'api', 'db'],
});

// ❌ BAD: Unrealistic or too minimal
const mockEntries = [{ id: '1' }];
```

## Test Selectors

```typescript
// ✅ GOOD: Semantic queries (resilient to refactoring)
canvas.getByRole('button', { name: /apply filter/i })
canvas.getByLabelText('Trace ID')
canvas.getByPlaceholderText('Search...')

// ❌ BAD: Fragile selectors (break on refactor)
canvas.querySelector('.btn-apply')
canvasElement.children[0].children[2]
```

## Play Function Structure

```typescript
// ✅ GOOD: Organized with steps and assertions
play: async ({ canvasElement, step }) => {
  const canvas = within(canvasElement);

  await step('Arrange: Set up initial state', async () => {
    // Setup any initial state
  });

  await step('Act: User performs action', async () => {
    await userEvent.click(canvas.getByRole('button'));
  });

  await step('Assert: Verify outcome', async () => {
    expect(canvas.getByText(/success/i)).toBeInTheDocument();
  });
},

// ❌ BAD: No structure, hard to debug
play: async ({ canvasElement }) => {
  userEvent.click(canvasElement.querySelector('button'));
  // Missing step context and assertions
},
```

## Performance Considerations

```typescript
// ✅ GOOD: Use mixin story for large datasets
export const LargeDataset: Story = {
  ...Default,
  args: {
    ...Default.args,
    entries: generateLargeDataset(10000),
  },
  parameters: {
    // Disable add-ons that slow down rendering
    docs: { disable: true },
    actions: { disable: true },
  },
};

// ❌ BAD: Every story with huge dataset
export const Story1: Story = {
  args: { entries: generateLargeDataset(50000) },
};
```
