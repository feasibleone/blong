# Allure 3 Enhanced Reporting Guide

## Overview

blong-ttk uses Allure 3 for comprehensive test reporting with built-in support for:
- Test hierarchy visualization
- Parallel execution timeline
- Trace link integration
- Failure classification
- History tracking
- Flaky test detection

## Features

### 1. Test Hierarchy (Nested Steps)

Tests are organized in a tree structure showing:
- Collections → Groups → Steps → Substeps

```typescript
group('P2P Transfer')([
    async function lookupParty(assert, {$meta}) {
        // Substeps appear nested under this
        await partyPartyGet(...);
        await callbackCallbackWait(...);
    },
    async function requestQuote(assert, {lookupParty, $meta}) {
        // Dependencies shown in tree
        await quoteQuoteCreate(...);
    },
])
```

**View**: Allure → Behaviors tab shows hierarchy

### 2. Execution Timeline

Allure Timeline tab visualizes parallel execution:
- Horizontal bars show test duration
- Overlapping bars indicate parallel steps
- Useful for identifying bottlenecks

**Configuration**: Automatic via `start`/`stop` timestamps in results

### 3. Trace Links

Each test result includes a link to the blong-log trace viewer:

```typescript
// Configured in server.ts:
allure: {
    logUrl: 'http://localhost:9998/trace/{traceId}',
}
```

**View**: Each test in Allure has "Trace" link → opens log viewer at `{traceId}`

### 4. Failure Classification

Tests are automatically categorized by failure type using `categories.json`:

| Category | Matches |
|----------|---------|
| Transfer Failures | Failed transfer operations |
| Quote Failures | Failed quote operations |
| Timeout Errors | Operations exceeding timeout |
| Callback Not Received | Missing expected callbacks |
| HTTP 400/404/500 | HTTP error codes |
| Validation Errors | Schema/data validation |
| Provisioning Failures | Failed entity creation |
| Network Errors | Connection issues |

**Configuration**: `config/categories.json` with regex patterns

**View**: Allure → Categories tab shows distribution

### 5. History Tracking

Allure tracks test results across runs:
- Trend charts (pass rate over time)
- Duration trends
- Flaky test detection

```typescript
allure: {
    historyPath: '.allure/history.jsonl',
}
```

**Setup**: History file persists between runs (commit to repo or CI cache)

**View**: Allure → Overview → Trend chart

### 6. Flaky Test Detection

Tests that fail then pass on retry are marked as flaky:

```typescript
// blong-chain retry detection
statusDetails: {
    flaky: true,
}
```

**View**: Flaky tests highlighted in yellow in Allure report

## Configuration

### Basic Setup (server.ts)

```typescript
allure: {
    outputDir: 'allure-results',
    historyPath: '.allure/history.jsonl',
    generateOnEnd: false,
    logUrl: 'http://localhost:9998/trace/{traceId}',
    categoriesPath: './config/categories.json',
}
```

### Custom Categories

Edit `config/categories.json`:

```json
[
  {
    "name": "Custom Failure Type",
    "description": "Description of this failure class",
    "matchedStatuses": ["failed", "broken"],
    "messageRegex": ".*keyword.*",
    "traceRegex": ".*handlerName.*"
  }
]
```

**Fields**:
- `name`: Category name
- `matchedStatuses`: Which statuses to match (`failed`, `broken`, `passed`, `skipped`)
- `messageRegex`: Regex for error message
- `traceRegex`: Regex for stack trace

### Environment Metadata

Automatically captured in `environment.properties`:
- Framework: blong
- Language: typescript
- Node version
- Platform/arch
- CI: true (if in CI)
- GitHub run ID (if applicable)

## Generating Reports

### Command Line

```bash
# Run tests (writes results to allure-results/)
node -e "import('@feasibleone/blong-ttk').then(m => 
    m.engineCollectionRun({collection: './p2p.ts'}, {})
)"

# Generate HTML report
allure generate allure-results -o allure-report --clean

# Open in browser
allure open allure-report
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Run tests
  run: node run-tests.js

- name: Generate Allure Report
  if: always()
  run: |
    npm install -g allure-commandline
    allure generate allure-results -o allure-report --clean

- name: Publish Report
  if: always()
  uses: peaceiris/actions-gh-pages@v3
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    publish_dir: ./allure-report
```

## Report Sections

### Overview
- Total/passed/failed/broken/skipped counts
- Success rate
- Duration
- Trend charts (if history enabled)

### Categories
- Failure type distribution
- Click category → see affected tests

### Suites
- Tests grouped by suite/collection
- Tree view of hierarchy

### Graphs
- Status breakdown pie chart
- Duration chart
- Timeline chart

### Timeline
- Horizontal Gantt-style view
- Shows parallel execution
- Hover for details

### Behaviors
- Tests grouped by feature/story
- Based on labels

### Packages
- Tests grouped by package/realm

## Best Practices

### 1. Use Descriptive Test Names

```typescript
// Good
async function verifyTransferCommittedWithCorrectAmount(assert, {...}) { }

// Avoid
async function test1(assert, {...}) { }
```

### 2. Add Context to Assertions

```typescript
// Good
assert.equal(transfer.state, 'COMMITTED', 
    `Expected COMMITTED but got ${transfer.state} for transfer ${transfer.id}`);

// Basic
assert.equal(transfer.state, 'COMMITTED');
```

### 3. Structure Tests Logically

```typescript
group('Feature')([
    // Setup steps
    async function setup(...) { },
    
    // Action steps
    async function performAction(...) { },
    
    // Verification steps
    async function verifyResult(...) { },
])
```

### 4. Use Labels for Organization

```typescript
// Collections automatically get labels:
// - parentSuite: realm name
// - suite: collection name
// - subSuite: group name
```

### 5. Keep History

```bash
# Commit history file
git add .allure/history.jsonl

# Or cache in CI
- uses: actions/cache@v3
  with:
    path: .allure/
    key: allure-history-${{ github.run_id }}
    restore-keys: allure-history-
```

## Troubleshooting

### No Timeline Data

**Problem**: Timeline tab is empty

**Solution**: Ensure `start` and `stop` timestamps are in results

### Categories Not Working

**Problem**: Tests not classified

**Solution**: 
1. Check `categories.json` syntax
2. Verify regex patterns match error messages
3. Test regex at https://regex101.com

### History Not Showing

**Problem**: No trend charts

**Solution**: 
1. Ensure `historyPath` is set
2. History file must persist between runs
3. Generate report with `--clean` only on first run

### Trace Links Broken

**Problem**: Clicking trace link fails

**Solution**:
1. Ensure blong-log server is running
2. Check `logUrl` pattern in config
3. Verify `{traceId}` is replaced correctly

## Advanced Features

### Custom Attachments

```typescript
// Add screenshots, logs, etc.
const attachment = {
    name: 'screenshot.png',
    type: 'image/png',
    source: 'screenshots/test-123.png',
};
```

### Custom Parameters

```typescript
// Add test parameters for data-driven tests
parameters: [
    {name: 'amount', value: '100'},
    {name: 'currency', value: 'USD'},
]
```

### Retry Information

```typescript
// Automatically tracked by blong-chain
statusDetails: {
    flaky: true,
    message: 'Passed after retry',
}
```

## Examples

See:
- `examples/collections/mojaloop/onboarding.ts` - Parallel provisioning
- `examples/collections/mojaloop/p2p-transfer.ts` - E2E flow with callbacks
- `config/categories.json` - Failure classification patterns
