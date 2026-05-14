#!/bin/bash
# Shared unit-test / coverage runner for blong packages.
#
# Usage (from within the package directory):
#   run-coverage.sh [report]
#
# Without "report": runs the tap tests only (used by ci-unit).
# With "report":    runs the tests then generates lcov + text coverage
#                   report into coverage/ (used by ci-coverage).
# When CI is defined assume "report" mode
#
# Callers configure the runner via environment variables:
#
#   TAP_FILES          – space-separated list of test files (required)
#   COVERAGE_INCLUDE   – glob for source files to include in coverage report
#                        (required when "report" is used)
#   COVERAGE_EXCLUDE   – glob to exclude from coverage (optional)
#   COVERAGE_TEMP_DIR  – absolute path to store V8 coverage JSONs
#                        (default: <core-dir>/<package-name>/.tap/coverage)
#   COVERAGE_OUT_DIR   – absolute path for lcov output
#                        (default: <package-dir>/coverage)
#   REPORT_CWD         – directory from which c8 is run (default: CORE_DIR),
#                        needed when source include globs are relative to
#                        a parent directory (e.g. blong-gogo/src from core/).

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_DIR="$(dirname "$SCRIPT_DIR")"
C8="$CORE_DIR/../common/temp/node_modules/.pnpm/node_modules/.bin/c8"

PKG_NAME="$(basename "$PWD")"
TEMP_DIR="${COVERAGE_TEMP_DIR:-$CORE_DIR/$PKG_NAME/.tap/coverage}"
TAP_FILES="${TAP_FILES:-**/*.test.ts}"
# This script is purpose-built to capture blong-gogo coverage.
COVERAGE_INCLUDE="${COVERAGE_INCLUDE:-blong-gogo/src/**/*.ts}"
COVERAGE_EXCLUDE="${COVERAGE_EXCLUDE:-blong-gogo/src/**/*.test.ts}"

# Run tests. tap v21 collects V8 coverage by default into .tap/coverage/.
# We do NOT pass --coverage-map: it causes "No coverage generated" exit 1 when
# tap can't resolve TypeScript source paths (e.g. sibling packages compiled
# in-memory by tsx). --allow-incomplete-coverage prevents threshold failures.
# c8 report reads the raw V8 JSON from TEMP_DIR and produces the lcov output.
# shellcheck disable=SC2086
tap $TAP_FILES \
    --allow-incomplete-coverage \
    --coverage-report=none

if [[ "${1:-}" == "report"  || -n "${CI:-}" ]]; then
    OUT_DIR="${COVERAGE_OUT_DIR:-$PWD/coverage}"
    REPORT_CWD="${REPORT_CWD:-$CORE_DIR}"

    exclude_flag=""
    [[ -n "${COVERAGE_EXCLUDE:-}" ]] && exclude_flag="--exclude '$COVERAGE_EXCLUDE'"

    (
        cd "$REPORT_CWD"
        # shellcheck disable=SC2086
        "$C8" report \
            --temp-directory "$TEMP_DIR" \
            --include "$COVERAGE_INCLUDE" \
            $exclude_flag \
            --reporter text \
            --reporter lcov \
            -o "$OUT_DIR"
    )
fi
