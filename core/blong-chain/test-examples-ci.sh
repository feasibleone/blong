#!/bin/bash
# CI script to verify example tests produce expected error output

set -e  # Exit on error

echo "Running example tests and verifying error output..."

# Run example tests and capture output
OUTPUT=$(npm run test:examples 2>&1 || true)

# Define expected patterns that should appear in the output
EXPECTED_PATTERNS=(
    "Error Reporting Demo"
    "shows error in nested output with full details"
    "This error will appear in nested output with indentation"
    "errorStep"
    "✖.*errorStep"
    "shows errors in nested groups with proper indentation"
    "Query failed: table not found"
    "failedQuery"
    "demonstrates multiple errors at different nesting levels"
    "Level 1 failure"
    "Level 2 failure"
    "level1Error"
    "level2Error"
    "Demo: Nested Test Context with Automatic Indentation"
    "demonstrates nested test hierarchy"
    "demonstrates deeply nested hierarchy"
    "shows parallel execution within groups"
)

# Track failures
FAILED=0
MISSING_PATTERNS=()

# Check each pattern
for PATTERN in "${EXPECTED_PATTERNS[@]}"; do
    if ! echo "$OUTPUT" | grep -q "$PATTERN"; then
        FAILED=1
        MISSING_PATTERNS+=("$PATTERN")
    fi
done

# Verify that some tests failed (as expected)
if echo "$OUTPUT" | grep -q "ℹ fail 0"; then
    echo "❌ ERROR: Example tests should have failures but all passed!"
    FAILED=1
fi

# Report results
if [ $FAILED -eq 0 ]; then
    echo "✅ All expected error patterns found in output"
    echo "✅ Example tests demonstrated error reporting correctly"
    exit 0
else
    echo "❌ Some expected patterns were missing:"
    for PATTERN in "${MISSING_PATTERNS[@]}"; do
        echo "   - $PATTERN"
    done
    echo ""
    echo "Full output:"
    echo "$OUTPUT"
    exit 1
fi
