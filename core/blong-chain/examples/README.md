# TestExecutor Examples

This directory contains demonstration tests that show real-world usage of the TestExecutor with nested test contexts. **These tests contain intentional failures** to demonstrate error reporting functionality.

## Purpose

These examples are NOT part of the standard CI verification suite. They exist to:

1. **Demonstrate visual output** - Show how nested test hierarchy appears with indentation
2. **Show error reporting** - Display how errors are reported at different nesting levels
3. **Provide usage examples** - Serve as reference for implementing test executors

## Running Examples

### For Visual Inspection

```bash
# Build first
npm run build

# Run example demonstrations (will show intentional failures)
npm run test:examples
```

**Expected:** Some tests will fail (intentionally). Look for:

- ✖ marks indicating failed steps
- Error messages with proper indentation
- Progress summaries showing error details

### For CI Verification

```bash
# Verify example output contains expected patterns
npm run test:examples:ci
# or
npm run ci-examples
```

This script:

1. Runs the example tests
2. Verifies expected error patterns appear in output
3. Confirms intentional failures are properly displayed
4. Exits with success if all patterns found

**Expected:** Script exits successfully after verifying error patterns.

## Example Files

### demo.test.ts

Demonstrates nested test context with automatic indentation:

- Basic nested test hierarchy
- Deeply nested hierarchies (3+ levels)
- Parallel execution within groups

### error-demo.test.ts

Demonstrates error reporting in nested test contexts:

- Error reporting with full details
- Errors in nested groups with proper indentation
- Multiple errors at different nesting levels

## CI Integration

The example tests are verified in CI using pattern matching rather than pass/fail:

```bash
# Recommended for CI - runs both unit tests and example verification
npm run ci-unit
```

This ensures:

- Error reporting functionality works correctly
- Visual output remains consistent
- Examples continue to serve as accurate documentation
- CI doesn't fail due to intentional demonstration failures

## Why Separate from Main Tests?

Test frameworks like `node:test` mark parent tests as failed when child tests fail. This makes it impossible to write assertions that verify error handling without causing the entire test suite to fail.

By separating demonstration tests:

- Main test suite (`index.test.ts`) verifies functionality (54 tests, all pass)
- Examples show visual output and behaviour (contains intentional failures)
- CI can verify both sets without false negatives
