#!/bin/bash
# Unit-test / coverage runner for blong-gogo.
# Delegates to the shared script in core/common/.
set -e
export TAP_FILES='src/*.test.ts'
export COVERAGE_INCLUDE='blong-gogo/src/**/*.ts'
export COVERAGE_EXCLUDE='blong-gogo/src/**/*.test.ts'
export COVERAGE_TEMP_DIR="blong-gogo/.tap/coverage"
export COVERAGE_OUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/coverage"
exec "$(dirname "$0")/../common/run-coverage.sh" "$@"
