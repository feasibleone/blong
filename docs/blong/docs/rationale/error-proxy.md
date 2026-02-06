# Error Proxy System

Simplified error referencing using JavaScript Proxy for better developer experience.

## Overview

The Blong framework now supports a simplified syntax for referencing errors in handlers, making error handling more ergonomic while maintaining full backwards compatibility.

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

This behavior ensures that typos and incorrect error names are caught immediately during development, rather than failing silently or at runtime.

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

Comprehensive test coverage added in `/core/blong-gogo/src/error.proxy.test.ts`:

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

All tests pass. Run with:

```bash
cd /home/kalin/work/blong/blong/core/blong-gogo
node --test src/error.proxy.test.ts
```

## Documentation Updates

The following documentation has been updated to reflect the new syntax:

1. **Skills**:
   - `blong-error`: Complete error management patterns
   - `blong-handler`: Handler implementation patterns

2. **Examples**:
   - All handler examples now show the simplified syntax
   - Legacy syntax examples preserved as "backwards compatible" notes

3. **Tests**:
   - New test file: `error.proxy.test.ts`
   - Demonstrates all access patterns and edge cases

## Files Changed

### Core Implementation

- `/core/blong-gogo/src/error.ts` - Added Proxy-based error lookup

### Examples

- `/app/release/release/orchestrator/job/releaseJobTrigger.ts` - Updated to new syntax
- `/app/release/release/orchestrator/dfsp/releaseDfspPing.ts` - Updated to new syntax

### Tests

- `/core/blong-gogo/src/error.proxy.test.ts` - New comprehensive test suite

### Documentation

- `/.github/skills/error/SKILL.md` - Updated with new syntax patterns
- `/.github/skills/handler/SKILL.md` - Updated examples
- `/docs/blong/docs/rationale/error-proxy.md` - This design document

## Backwards Compatibility

100% backwards compatible. All existing code continues to work without any changes:

- ✅ Dot notation access: `errors['release.jobTrigger']`
- ✅ Destructuring with renaming: `{'release.jobTrigger': errorReleaseJobTrigger}`
- ✅ All existing tests pass
- ✅ No runtime performance impact

## Future Considerations

Potential future enhancements:

1. **TypeScript Types**: Generate type definitions for better autocomplete
2. **Error Discovery**: IDE plugin to show available errors
3. **Migration Tool**: Automated codemod to convert old syntax to new
4. **Lint Rules**: ESLint rule to encourage new syntax in new code

## Questions?

For questions or issues, refer to the comprehensive test suite in `error.proxy.test.ts` which demonstrates all usage patterns.
