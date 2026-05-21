# Error Proxy System

## Problem

Referencing typed errors inside handlers required verbose string-keyed
destructuring that clashed with normal JavaScript patterns. The dot-notation
key format — necessary to encode the `realm.errorName` ownership — forced
developers to use the explicit rename syntax:

```typescript
export default handler(
    ({errors: {'release.jobTrigger': errorReleaseJobTrigger}}) =>
        async function releaseJobTrigger(params, $meta) {
            throw errorReleaseJobTrigger({params: {jobName: 'test'}}, $meta);
        }
);
```

This had three compounding issues:

1. **IDE friction** — string-keyed destructuring provides no autocomplete and
   the rename requirement is unfamiliar to most JavaScript developers.
2. **Typo risk deferred to runtime** — a misspelled key in a string literal
   (`'release.jobTriger'`) would not be caught until the error was actually
   thrown, potentially in production.
3. **Verbosity** — every error reference required two tokens (the string key
   and the local variable name) even when both encode the same information.

## Solution

A JavaScript `Proxy` wraps the errors map at handler registration time, enabling
a simplified camelCase destructuring syntax while preserving full backwards
compatibility. The proxy converts property access from
`errorReleaseJobTrigger` → `release.jobTrigger` via a case-insensitive lookup,
performing the transformation at definition time (once, not per call).

```typescript
export default handler(
    ({errors: {errorReleaseJobTrigger}}) =>
        async function releaseJobTrigger(params, $meta) {
            throw errorReleaseJobTrigger({params: {jobName: 'test'}}, $meta);
        }
);
```

## Overview

The Blong framework supports a simplified syntax for referencing errors in
handlers, making error handling more ergonomic while maintaining full backwards
compatibility.

## What Changed

### Before (Legacy Syntax - Still Supported)

```typescript
export default handler(
    ({errors: {'release.jobTrigger': errorReleaseJobTrigger}}) =>
        async function releaseJobTrigger(params, $meta) {
            throw errorReleaseJobTrigger({params: {jobName: 'test'}}, $meta);
        }
);
```

### After (New Simplified Syntax - Recommended)

```typescript
export default handler(
    ({errors: {errorReleaseJobTrigger}}) =>
        async function releaseJobTrigger(params, $meta) {
            throw errorReleaseJobTrigger({params: {jobName: 'test'}}, $meta);
        }
);
```

## Key Benefits

1. **Simpler Syntax**: No more string quotes and explicit renaming
2. **Better IDE Support**: Improved autocomplete with direct property access
3. **Case-Insensitive**: `errorReleaseJobTrigger`, `errorreleasjobtrigger`, and `ERRORRELEASEJOBTRIGGER` all work
4. **Backwards Compatible**: Old dot notation syntax continues to work
5. **Less Typing**: Cleaner, more concise code
6. **Early Error Detection**: Typos in error names throw immediately during destructuring, catching bugs early

## How It Works

The error system now uses a JavaScript Proxy that:

1. **Maintains Original Keys**: Errors are still stored with their dot notation (e.g., `'release.jobTrigger'`)
2. **Provides Multiple Access Patterns**:
   - Direct dot notation: `errors['release.jobTrigger']` (backwards compatible)
   - Simplified camelCase: `errors.errorReleaseJobTrigger` (new)
   - Destructuring: `{errorReleaseJobTrigger}` from `errors` (new)
3. **Case-Insensitive Lookup**: Converts property names to lowercase for matching
4. **Optional Error Prefix**: Works with or without the "error" prefix
5. **Immediate Error on Typos**: Throws immediately when accessing non-existent errors to catch typos during destructuring

## Naming Convention

Error keys are automatically mapped to camelCase variables:

| Error Key (Definition) | Variable Name (Usage) |
|------------------------|----------------------|
| `'release.jobTrigger'` | `errorReleaseJobTrigger` |
| `'user.notFound'` | `errorUserNotFound` |
| `'payment.insufficientFunds'` | `errorPaymentInsufficientFunds` |
| `'hsm.connection.timeout'` | `errorHsmConnectionTimeout` |

## Implementation Details

### Internal Storage

- Errors are stored with their original dot-notation keys
- A secondary lookup map stores lowercase, no-dot versions for fast matching
- Example: `'release.jobTrigger'` → lookup key: `'releasejobtrigger'`

### Proxy Logic

The error proxy is created once upfront and cached for performance. When accessing `errors.errorReleaseJobTrigger`:

1. Check if property exists directly (for backwards compatibility)
2. If not, convert to lowercase: `'errorReleaseJobTrigger'` → `'errorreleasjobtrigger'`
3. Remove "error" prefix if present: `'errorreleasjobtrigger'` → `'releasejobtrigger'`
4. Look up in the error lookup map: `'releasejobtrigger'` → `'release.jobTrigger'`
5. Return the error handler for `'release.jobTrigger'`

**Performance:** The proxy is instantiated once and reused on all subsequent `get()` calls, avoiding repeated proxy creation overhead.

### Real Implementation

The proxy implementation lives in `core/blong-gogo/src/error.ts`:

```typescript
const errorsProxy = new Proxy(errors, {
    get(target, prop: string | symbol) {
        if (typeof prop === 'symbol') return target[prop];
        if (prop in target) return target[prop]; // direct/dot-notation access

        let lookupKey = (prop as string).toLowerCase();
        if (lookupKey.startsWith('error')) {
            lookupKey = lookupKey.substring(5); // strip 'error' prefix
        }
        const originalKey = errorLookup[lookupKey];
        if (originalKey && target[originalKey]) return target[originalKey];

        // Throws immediately — catches typos at destructure time
        throw new Error(
            `Error '${String(prop)}' not found. Available errors: ${Object.keys(target).join(', ')}`,
        );
    },
    has(target, prop) { /* ... */ }
});
```

### Type Safety

The proxy maintains all error handler properties:

- `type`: Original error key (e.g., `'release.jobTrigger'`)
- `message`: Error message template
- `params`: Array of parameter names extracted from message template
- `print`: Optional print message

### Error Detection

**Typo Protection:** The proxy throws immediately when accessing a non-existent error:

```typescript
const errors = errorFactory.get();

// This throws immediately with a helpful message
const {errorTypoInName} = errors;
// Error: Error 'errorTypoInName' not found. Available errors: release.jobTrigger, release.ping, ...

// Catches typos during destructuring
const {errorReleaseJobTrigger, errorWrongName} = errors;
// Error: Error 'errorWrongName' not found. Available errors: ...
```

This behaviour ensures that typos and incorrect error names are caught immediately during development, rather than failing silently or at runtime.

## Migration Guide

### No Breaking Changes

All existing code continues to work. Migration is optional but recommended for new code.

### Recommended Migration Path

1. **New Handlers**: Use simplified syntax from the start
2. **Existing Handlers**: Update incrementally as you touch the code
3. **No Rush**: Both syntaxes can coexist in the same codebase

### Example Migration

```typescript
// Before
export default handler(
    ({
        errors: {
            'user.notFound': errorUserNotFound,
            'user.invalidEmail': errorUserInvalidEmail,
            'user.exists': errorUserExists
        }
    }) => {
        // handler implementation
    }
);

// After
export default handler(
    ({
        errors: {
            errorUserNotFound,
            errorUserInvalidEmail,
            errorUserExists
        }
    }) => {
        // handler implementation
    }
);
```

## Testing

Comprehensive test coverage in `core/blong-gogo/src/error.proxy.test.ts`:

- ✅ Backwards compatibility with dot notation
- ✅ New camelCase access patterns
- ✅ Destructuring with both syntaxes
- ✅ Case-insensitive matching
- ✅ Parameterized errors
- ✅ Multi-part error names
- ✅ Immediate error throwing for non-existent errors
- ✅ Destructuring typo detection
- ✅ Property preservation
- ✅ Proxy instance caching (singleton pattern)

Run with:

```bash
cd core/blong-gogo
node --test src/error.proxy.test.ts
```

## Future Ideas

1. **Type-safe proxy via TypeScript template literals** — derive the camelCase
   property type from the dot-notation key at compile time using

   ```typescript
   type ErrorKey<T extends string> =`error${Capitalize<CamelCase<T>>}`
   ```

   so that `errors.errorReleaseJobTrigger` is type-checked against the defined
   error registry without runtime cost.

2. **Namespace sub-setting** — allow `errors.subset('release')` to return a
   proxy that only exposes `release.*` errors. This reduces the surface area
   visible in a handler and makes it easier to understand which errors a given
   handler can throw.

3. **Auto-generated error documentation** — expose an `errors.all()` method
   returning the full list of error types, messages, and HTTP status codes.
   The framework can call this at startup to populate the OpenAPI `responses`
   section automatically, ensuring API documentation stays in sync with the
   error registry.

4. **Coverage for error handling in tests** — extend the test framework to track
   which errors are thrown during test execution and report on error coverage,
   similar to code coverage. This encourages testing of edge cases and ensures that
   all defined errors are exercised by tests.
