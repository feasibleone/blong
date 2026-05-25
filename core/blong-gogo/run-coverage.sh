#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_DIR="$(dirname "$SCRIPT_DIR")"
C8="$CORE_DIR/../common/temp/node_modules/.pnpm/node_modules/.bin/c8"

cd "$(dirname "$CORE_DIR")"
cp core/blong-int-adapter/.tap/coverage/* core/blong-gogo/.tap/coverage
cp core/test/.tap/coverage/* core/blong-gogo/.tap/coverage

"$C8" report \
    --all \
    --temp-directory core/blong-gogo/.tap/coverage \
    --include "core/blong-gogo/src/**/*.ts" \
    --include "core/test/**/*.ts" \
    --include "core/blong-int-adapter/**/*.ts" \
    --reporter text \
    --reporter lcov \
    -o coverage
