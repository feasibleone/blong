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
