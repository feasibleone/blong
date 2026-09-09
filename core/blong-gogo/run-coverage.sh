#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_DIR="$(dirname "$SCRIPT_DIR")"
REPO_DIR="$(dirname "$CORE_DIR")"

cd "$REPO_DIR"

# --- Locate c8 (hoisted into the pnpm store by the tap toolchain) ----------
C8=""
for candidate in \
    "$REPO_DIR/common/temp/node_modules/.pnpm/node_modules/.bin/c8" \
    "$CORE_DIR/blong-gogo/node_modules/.bin/c8" \
    "$REPO_DIR/node_modules/.bin/c8"; do
    if [ -x "$candidate" ]; then
        C8="$candidate"
        break
    fi
done
if [ -z "$C8" ]; then
    echo "run-coverage.sh: ERROR: c8 binary not found (expected in common/temp pnpm store)" >&2
    exit 1
fi

# --- Staging dir: raw V8 (tap/Playwright) + istanbul (vitest) coverage JSON --
# Coverage is merged from every package that produced any. The dir is rebuilt
# on each run so stale files can never distort the aggregated report.
STAGE="$CORE_DIR/blong-gogo/.tap/coverage-merge"
rm -rf "$STAGE"
mkdir -p "$STAGE"

# Packages whose raw V8 (tap + Playwright) coverage is aggregated.
# blong-browser coverage is merged separately from its vitest output (below).
#
# Default set mirrors the packages that exercise the framework:
#   blong-gogo         - gogo's own tap unit tests (its src/ lives here)
#   test               - @feasibleone/test, boots the full framework
#   blong-int-adapter  - integration tests that exercise the framework
#   blong-marine/suite - E2E suites (also cover their own realm sources)
#
# Override with COVERAGE_PACKAGES (space-separated package names):
#   COVERAGE_PACKAGES="blong-gogo test blong-int-adapter blong-marine blong-suite"
COVER_PKGS=()
if [ -n "${COVERAGE_PACKAGES:-}" ]; then
    read -r -a COVER_PKGS <<< "$COVERAGE_PACKAGES"
else
    COVER_PKGS=(blong-gogo test blong-int-adapter blong-marine blong-suite)
fi

merged=0
for name in "${COVER_PKGS[@]}"; do
    pkg="$REPO_DIR/core/$name"
    if [ ! -d "$pkg" ]; then
        echo "run-coverage.sh: WARNING package core/$name not found, skipping"
        continue
    fi
    if [ -d "$pkg/.tap/coverage" ]; then
        while IFS= read -r f; do
            cp -f "$f" "$STAGE/$name-$(basename "$f")"
            merged=$((merged + 1))
        done < <(find "$pkg/.tap/coverage" -maxdepth 1 -type f -name '*.json' 2>/dev/null | sort)
    fi
done

echo "run-coverage.sh: merged $merged V8 coverage file(s) from ${#COVER_PKGS[@]} package(s)"
if [ "$merged" -eq 0 ]; then
    echo "run-coverage.sh: ERROR: no coverage JSON found in any package — did ci-test run before ci-coverage?" >&2
    exit 1
fi

gogo_refs=$(grep -l 'blong-gogo/src' "$STAGE"/*.json 2>/dev/null | wc -l)
echo "run-coverage.sh: $gogo_refs merged file(s) reference blong-gogo/src"

# 1) Convert the server V8 coverage into an istanbul coverage map.
SERVER_MAP="$CORE_DIR/blong-gogo/.tap/coverage-map"
rm -rf "$SERVER_MAP"
mkdir -p "$SERVER_MAP"
"$C8" report \
    --all \
    --temp-directory "$STAGE" \
    --include "core/blong-gogo/src/**/*.ts" \
    --include "core/test/**/*.ts" \
    --include "core/blong-int-adapter/**/*.ts" \
    --include "core/blong-suite/**/*.ts" \
    --include "core/blong-marine/**/*.ts" \
    --exclude "**/*.test.*" "**/*.d.ts" \
    --reporter json \
    -o "$SERVER_MAP"
if [ ! -f "$SERVER_MAP/coverage-final.json" ]; then
    echo "run-coverage.sh: ERROR: c8 did not produce coverage-final.json" >&2
    exit 1
fi

# 2) blong-browser coverage (vitest) is already an istanbul map with real hits.
BROWSER_JSON="$REPO_DIR/core/blong-browser/coverage/coverage-final.json"

# 3) Merge and render the unified lcov + HTML report with istanbul. c8's report
#    cannot read istanbul maps (it reports vitest coverage as 0%), so we unify
#    the server map (c8 --reporter json) and the browser map (vitest) here.
COVER_ARGS=("$REPO_DIR/coverage" "$SERVER_MAP/coverage-final.json")
if [ -f "$BROWSER_JSON" ]; then
    COVER_ARGS+=("$BROWSER_JSON")
    echo "run-coverage.sh: including vitest coverage for blong-browser"
fi
C8_BIN_DIR="$(dirname "$C8")" REPO_DIR="$REPO_DIR" node \
    "$CORE_DIR/blong-gogo/mergeCoverage.mjs" "${COVER_ARGS[@]}"

# 4) Guard: never silently ship a report without framework coverage.
gogo_sf=$(grep -c 'core/blong-gogo/src' coverage/lcov.info 2>/dev/null || true)
echo "run-coverage.sh: lcov.info reports $gogo_sf blong-gogo source file(s)"
if [ "$gogo_sf" -eq 0 ] && [ "${COVERAGE_ALLOW_NO_GOGO:-0}" != "1" ]; then
    echo "run-coverage.sh: ERROR: aggregated report contains no core/blong-gogo coverage (merged $merged JSON(s), $gogo_refs referencing gogo). Set COVERAGE_ALLOW_NO_GOGO=1 to ignore." >&2
    exit 1
fi

# Leave the tree tidy: staging + server-map dirs are transient.
rm -rf "$STAGE" "$SERVER_MAP"
