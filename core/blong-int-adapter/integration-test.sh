#!/bin/bash
# Integration test runner for blong-gogo adapter source files.
#
# Usage:
#   ./integration-test.sh              – run all adapters (full run)
#   ./integration-test.sh http k8s    – run specific adapters (partial run)
#   ./integration-test.sh report      – re-generate the coverage report only
#
# tap clears .tap/coverage/ before each run, so each adapter's V8 data is
# copied to .tap/coverage-all/ immediately after the run. At the end the
# accumulated data is used to produce an lcov + text report in coverage/,
# the standard package-level location the CI integration job can upload.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_DIR="$(dirname "$SCRIPT_DIR")"
PKG_NAME="$(basename "$SCRIPT_DIR")"
C8="$CORE_DIR/../common/temp/node_modules/.pnpm/node_modules/.bin/c8"

# Adapters that require a backend service – maps adapter name → wait.sh arg.
# Adapters absent from this map (http, k8s) need no wait.
declare -A WAIT_SERVICE=(
    [kafka]=kafka
    [keycloak]=keycloak
    [mongodb]=mongodb
    [mysql]=mysql
    [s3]=minio
    [vault]=vault
)

ALL_ADAPTERS=(k8s http mongodb mysql s3 keycloak vault kafka)

generate_report() {
    echo ""
    echo "=== Aggregated adapter coverage ==="
    # Run c8 from core/ so the sibling blong-gogo source paths are within cwd.
    # lcov.info is written to coverage/ (standard package coverage location).
    (
        cd "$CORE_DIR"
        "$C8" report \
            --temp-directory "$PKG_NAME/.tap/coverage-all" \
            --include 'blong-gogo/src/adapter/server/*.ts' \
            --reporter text \
            --reporter lcov \
            -o "$SCRIPT_DIR/coverage"
    )
}

# report-only mode: regenerate from existing .tap/coverage-all/ data
if [[ "${1:-}" == "report" ]]; then
    generate_report
    exit $?
fi

ADAPTERS=("${@:-${ALL_ADAPTERS[@]}}")

# Reset the coverage accumulator for this run
rm -rf "$SCRIPT_DIR/.tap/coverage-all"
mkdir -p "$SCRIPT_DIR/.tap/coverage-all"

run_adapter() {
    local name=$1
    local wait_arg="${WAIT_SERVICE[$name]:-}"

    if [[ -n "$wait_arg" ]]; then
        "$SCRIPT_DIR/../../test/integration/wait.sh" "$wait_arg" || {
            echo "wait.sh failed for $name, skipping."
            return 1
        }
    fi

    tap index.test.ts \
        --allow-incomplete-coverage \
        --coverage-map=./coverage-map.mjs \
        --coverage-report=none \
        --test-arg="adapter.$name"
}

declare -A RESULTS
for adapter in "${ADAPTERS[@]}"; do
    run_adapter "$adapter"
    RESULTS[$adapter]=$?
    cp "$SCRIPT_DIR/.tap/coverage/"*.json "$SCRIPT_DIR/.tap/coverage-all/" 2>/dev/null || true
done

generate_report

FAILED=()
for adapter in "${ADAPTERS[@]}"; do
    [[ "${RESULTS[$adapter]:-0}" -ne 0 ]] && FAILED+=("$adapter")
done

if [[ ${#FAILED[@]} -gt 0 ]]; then
    echo ""
    echo "Failed adapters: ${FAILED[*]}"
    exit 1
fi

echo "All integration tests passed."
