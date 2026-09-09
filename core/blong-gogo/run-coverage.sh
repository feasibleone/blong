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

# Packages whose raw V8 coverage is merged into the unified report.
#
# The default set mirrors the packages that exercise the framework and the
# browser UI through real V8 coverage (which c8 understands):
#   blong-gogo         - gogo's own tap unit tests (its src/ lives here)
#   test               - @feasibleone/test, boots the full framework
#   blong-int-adapter  - integration tests that exercise the framework
#   blong-marine/suite - Playwright E2E that drive the blong-browser UI
#
# blong-browser's vitest output is NOT merged here: vitest emits istanbul
# coverage-final.json, which c8 cannot convert to hits (it yields 0%).
#
# Override with COVERAGE_PACKAGES (space-separated package names):
#   COVERAGE_PACKAGES="blong-gogo test blong-int-adapter blong-suite blong-marine blong-party blong-access"
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
    # tap / Playwright raw V8 coverage (uuid-*.json and pw-*.json). Files are
    # prefixed with the package name so they never collide across packages.
    if [ -d "$pkg/.tap/coverage" ]; then
        while IFS= read -r f; do
            cp -f "$f" "$STAGE/$name-$(basename "$f")"
            merged=$((merged + 1))
        done < <(find "$pkg/.tap/coverage" -maxdepth 1 -type f -name '*.json' 2>/dev/null | sort)
    fi
done

echo "run-coverage.sh: merged $merged coverage JSON file(s) from ${#COVER_PKGS[@]} package(s)"
if [ "$merged" -eq 0 ]; then
    echo "run-coverage.sh: ERROR: no coverage JSON found in any package — did ci-test run before ci-coverage?" >&2
    exit 1
fi

# Informational: how many merged files actually exercised blong-gogo source.
gogo_refs=$(grep -l 'blong-gogo/src' "$STAGE"/*.json 2>/dev/null | wc -l)
echo "run-coverage.sh: $gogo_refs merged file(s) reference blong-gogo/src"

# --- Aggregate into the root coverage/ report ------------------------------
"$C8" report \
    --all \
    --temp-directory "$STAGE" \
    --include "core/blong-gogo/src/**/*.ts" \
    --include "core/test/**/*.ts" \
    --include "core/blong-int-adapter/**/*.ts" \
    --include "core/blong-suite/**/*.ts" \
    --include "core/blong-marine/**/*.ts" \
    --include "core/blong-browser/src/**/*.ts" \
    --include "core/blong-browser/src/**/*.tsx" \
    --exclude "core/blong-gogo/**/*.test.*" \
    --exclude "core/blong-browser/**/*.stories.*" \
    --exclude "core/blong-browser/**/*.test.*" \
    --exclude "**/*.d.ts" \
    --reporter text \
    --reporter lcov \
    -o coverage

# --- Guard: never silently ship a report without framework coverage --------
gogo_sf=$(grep -c 'blong-gogo/src/' coverage/lcov.info 2>/dev/null || true)
echo "run-coverage.sh: lcov.info reports $gogo_sf blong-gogo source file(s)"
if [ "$gogo_sf" -eq 0 ] && [ "${COVERAGE_ALLOW_NO_GOGO:-0}" != "1" ]; then
    echo "run-coverage.sh: ERROR: aggregated report contains no core/blong-gogo coverage (merged $merged JSON(s), $gogo_refs referencing gogo). Set COVERAGE_ALLOW_NO_GOGO=1 to ignore." >&2
    exit 1
fi
