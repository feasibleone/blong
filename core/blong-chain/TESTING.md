# Testing Guide for blong-chain

This document explains how to run tests for the `@feasibleone/blong-chain` package.

## Test Structure

### Main Test Suite (`index.test.ts`)

Contains comprehensive verification tests for the TestExecutor functionality:

- Thenable proxy patterns
- Parallel execution
- Dependency tracking
- Progress tracking
- Error handling
- Latency metrics
- Nested test context integration

**Status:** All tests should PASS ✅
**Purpose:** CI/CD verification

### Example Tests (`examples/*.test.ts`)

Contains demonstration tests showing real-world usage:

- `demo.test.ts` - Nested test hierarchy demonstrations
- `error-demo.test.ts` - Error reporting demonstrations

**Status:** Contains intentional failures ✖ to demonstrate error reporting
**Purpose:** Manual exploration and documentation

## Running Tests

### For CI/CD (Automated Testing)

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Run CI test suite (all tests should pass)
npm test
# or equivalently:
npm run ci-unit

# Run example verification (verifies error patterns)
npm run ci-examples

# Run complete CI suite (unit tests + example verification)
npm run ci-unit
```

**Expected Result:**

- Unit tests: All 54 tests pass ✅
- Example verification: All expected error patterns found ✅

### For Local Development

```bash
# Run main test suite only
npm test

# Run example/demonstration tests (will show intentional failures)
npm run test:examples

# Run all tests (main + examples)
npm run test:all
```

## CI/CD Integration

### Package.json Scripts

- `npm test` - Runs only the main test suite (for CI)
- `npm run ci-unit` - Alias for `npm test`
- `npm run test:examples` - Runs example demonstrations (not for CI)
- `npm run test:examples:ci` - Verifies example output contains expected error patterns
- `npm run ci-examples` - Alias for `npm run test:examples:ci`
- `npm run ci-unit` - Runs unit tests and example verification
  (recommended for CI)
- `npm run test:all` - Runs all tests including examples

### GitHub Actions / CI Configuration

**Recommended CI configuration:**

```yaml
- name: Run tests
  run: |
    npm run build
    npm run ci-unit
```

This runs both:

1. Unit tests (54 verification tests - all should pass)
2. Example verification (validates error output patterns)

#### Alternative: Run only unit tests

```yaml
- name: Run tests
  run: npm run ci-unit
```

### How Example Verification Works

The `test:examples:ci` script:

1. Runs example tests (which contain intentional failures)
2. Captures the output
3. Uses grep to verify expected patterns appear:
   - Error messages ("This error will appear...")
   - Failed step names (errorStep, failedQuery, etc.)
   - Test structure markers (✖ marks, nested groups)
4. Verifies that some tests failed (as expected)
5. Exits with success if all patterns found

This ensures error reporting functionality works correctly without
treating intentional failures as CI failures.

### Expected CI Behaviour

✅ **Should Pass:** All 54 tests in `index.test.ts`
❌ **Should NOT Run in CI:** Example tests in `examples/` directory

## Test Counts

| Test Suite                      | Tests | Pass | Fail | Purpose                |
|-------------------------------- |-------|------|------|------------------------|
| Main (`index.test.ts`)          | 54    | 54   | 0    | CI verification        |
| Examples (`examples/*.test.ts`) | 39    | 23   | 16*  | Manual demonstration   |

\* Intentional failures for demonstration purposes

## Understanding Test Output

### Main Test Suite Output

```text
▶ TestExecutor - Thenable Proxy Patterns
  ✔ Pattern 1: await context.propertyName
  ✔ Pattern 2: {propertyName} then await propertyName
  ...
✔ TestExecutor - Thenable Proxy Patterns

ℹ tests 54
ℹ pass 54
ℹ fail 0
```

All check-marks (✔) indicate successful verification.

### Example Test Output

```text
▶ Error Reporting Demo
  ▶ shows error in nested output with full details
    ✔ successStep1
    ✖ errorStep  ← Intentional failure for demonstration
    ✔ successStep2
```

The ✖ marks show intentional failures that demonstrate error reporting functionality.

## Troubleshooting

### All tests failing in CI

**Symptom:** Many tests fail with errors
**Solution:** Ensure `npm run build` runs before `npm test`

### Example tests running in CI

**Symptom:** CI shows failures from example tests
**Solution:** Use `npm test` (not `npm run test:all`) in CI configuration

### Import errors

**Symptom:** "Cannot find module" errors
**Solution:** Run `npm run build` to compile TypeScript to JavaScript

## Test Development Guidelines

### Adding New Tests

1. Add verification tests to `index.test.ts` - these should always pass
2. Add demonstration tests to `examples/` - these may contain intentional failures
3. Run `npm test` to verify your changes don't break CI
4. Run `npm run test:examples` to verify demonstrations work as intended

### Test Naming Conventions

- **Verification tests:** Use descriptive names that explain what's being verified
- **Example tests:** Use descriptive names that explain what's being demonstrated

### When to Use Examples vs Main Tests

| Criteria                      | Main Tests           | Example Tests     |
| ----------------------------- | -------------------- | ----------------- |
| Should pass in CI             | ✅ Yes               | ❌ No             |
| Contains assertions           | ✅ Yes               | ✅ Yes            |
| Contains intentional failures | ❌ No                | ✅ May contain    |
| Purpose                       | Verify functionality | Demonstrate usage |
| Runs by default               | ✅ Yes               | ❌ No             |
