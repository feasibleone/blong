#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_DIR="$(dirname "$SCRIPT_DIR")"
C8="$CORE_DIR/../common/temp/node_modules/.pnpm/node_modules/.bin/c8"

cd "$(dirname "$CORE_DIR")"

# Merge coverage from all test packages into blong-gogo's .tap/coverage/
# This includes both tap-produced coverage and Playwright coverage (pw-* files
# written by blong-dev playwright --coverage).
for pkg in blong-int-adapter test blong-suite blong-marine; do
    src="core/$pkg/.tap/coverage"
    if [ -d "$src" ]; then
        cp "$src"/*.json core/blong-gogo/.tap/coverage/ 2>/dev/null || true
    fi
done

# Count how many Playwright coverage files were merged (informational).
pw_count=$(ls core/blong-gogo/.tap/coverage/pw-*.json 2>/dev/null | wc -l)
if [ "$pw_count" -gt 0 ]; then
    echo "run-coverage.sh: Including $pw_count Playwright coverage file(s)"
fi

"$C8" report \
    --all \
    --temp-directory core/blong-gogo/.tap/coverage \
    --include "core/blong-gogo/src/**/*.ts" \
    --include "core/test/**/*.ts" \
    --include "core/blong-int-adapter/**/*.ts" \
    --include "core/blong-suite/**/*.ts" \
    --include "core/blong-marine/**/*.ts" \
    --include "core/blong-browser/src/**/*.ts" \
    --include "core/blong-browser/src/**/*.tsx" \
    --reporter text \
    --reporter lcov \
    -o coverage
