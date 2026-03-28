# Snapshot Testing

Snapshot testing is an approach where the expected output of a test is captured
once and stored as a reference "snapshot". Subsequent test runs compare the
actual output against the stored snapshot to detect regressions.

## Rationale

### Problem

Many test collections contain repetitive assertions that check individual
properties of API responses. For example, a single API response assertion block
may contain dozens of field-by-field checks:

```typescript
assert.equal(result.status, 200);
assert.equal(result.body.transferState, 'COMMITTED');
assert.equal(result.body.completedTimestamp !== undefined, true);
assert.equal(result.body.transferId, transferId);
// ... many more assertions
```

This pattern has several issues:

- **Verbosity**: Large numbers of assertions obscure the test intent
- **Maintenance burden**: When API responses change, every assertion must be
  updated individually
- **Incomplete coverage**: Developers may skip asserting certain fields, missing
  regressions
- **Duplication**: The same assertion patterns repeat across many test files

### Solution

Snapshot testing addresses these issues by capturing the complete expected
output structure and comparing it as a whole:

```typescript
const result = await transferTransferGet({transferId}, $meta);
assert.snapshot(result, 'transfer-committed');
```

The snapshot file stores the complete expected structure, and the test framework
handles the comparison automatically.

### When to Use Snapshot Testing

Snapshot testing works well for:

- **API response validation**: Where the full response structure matters
- **Complex object comparisons**: Where many fields need verification
- **Regression detection**: Where any change to the output structure is
  significant
- **Migration scenarios**: Where existing test collections have many repetitive
  assertions that can be replaced

### When Not to Use Snapshot Testing

Snapshot testing should be avoided when:

- **Dynamic values**: Timestamps, UUIDs, and other non-deterministic fields
  need special handling (masking or ignoring)
- **Specific business rules**: When only specific fields matter and the test
  should document exactly which fields and why
- **Simple assertions**: When a few targeted assertions are clearer than a
  snapshot

### Handling Dynamic Values

Snapshots should support masking or normalizing dynamic values:

```typescript
assert.snapshot(result, 'transfer-committed', {
    mask: ['completedTimestamp', 'transferId'],
});
```

Masked fields are replaced with a placeholder value before comparison, so that
timestamps, IDs, and other dynamic values don't cause false failures.

### Snapshot Storage

Snapshots are stored alongside test files in a `__snapshots__` directory or
as `.snap` files. They should be committed to source control so that changes
to expected output are visible in code reviews.

### Relationship to Blong Testing

In the Blong framework, snapshot testing integrates with the existing
`blong-chain` test executor. Test steps can use snapshot assertions alongside
regular assertions. The snapshot approach is particularly valuable when
migrating existing test collections (such as ml-testing-toolkit JSON test
cases) where the original tests contain many repetitive field-by-field checks.

### Migration Strategy

When migrating test collections that have repetitive assertions:

1. **Identify candidates**: Look for test steps with more than 5-10 individual
   field assertions on the same response object
2. **Capture initial snapshots**: Run the test against a known-good environment
   to capture the reference output
3. **Replace assertions**: Replace the individual assertions with a single
   snapshot assertion
4. **Handle dynamic fields**: Add masking for timestamps, IDs, and other
   non-deterministic values
5. **Review snapshots**: Ensure the captured snapshot represents the correct
   expected behavior
