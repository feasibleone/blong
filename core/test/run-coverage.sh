#!/bin/bash
# Unit-test / coverage runner for core/test.
# Delegates to the shared script in core/common/.
set -e
export TAP_FILES='**/*.test.ts *.test.ts'
export COVERAGE_INCLUDE='blong-gogo/src/**/*.ts'
export COVERAGE_EXCLUDE='blong-gogo/src/**/*.test.ts'
# REPORT_CWD defaults to CORE_DIR (core/), so the include glob resolves correctly.
exec "$(dirname "$0")/../common/run-coverage.sh" "$@"
