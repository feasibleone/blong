#!/bin/bash
set -e

# Wait for a BlongDeployment to report a phase — and say why when it does not.
#
# The e2e steps that used to do this inline polled `.status.phase` in a loop and,
# on failure, printed nothing but "the operator never reported Ready". The reason
# lives in `status.message`, which names the failing step, and it only ever
# reached the diagnostics artifact: two investigations went through
# `gh run download` to read one line the step could have printed itself (F-471).
#
# Two rules, learned in those two rounds. A `Failed` phase does not recover by
# waiting, so it is reported the moment it appears rather than at the end of the
# budget — the wait is for an operator that is still working, not for one that has
# given up. And the whole resource is printed, not just the phase: the message
# names the first failed step, and the rest of the status says how far the pass
# got before it (T-317).
#
# Usage: wait-operator.sh <expected-phase> <what-is-awaited> [timeout-seconds]
#   NAMESPACE / NAME select the resource (default blong-suite / blong-suite).

expected="${1:?usage: wait-operator.sh <expected-phase> <what-is-awaited> [timeout-seconds]}"
awaited="${2:?usage: wait-operator.sh <expected-phase> <what-is-awaited> [timeout-seconds]}"
timeout="${3:-300}"
interval=5
namespace="${NAMESPACE:-blong-suite}"
name="${NAME:-blong-suite}"
elapsed=0

phase_now() {
  kubectl -n "${namespace}" get bdep "${name}" -o jsonpath='{.status.phase}' 2>/dev/null || true
}

# Everything the resource knows, on stderr, where a failing step belongs.
report() {
  local phase
  phase="$(phase_now)"
  {
    echo "the operator reports ${phase:-no phase} instead of ${expected} (${awaited})"
    echo "status.message: $(kubectl -n "${namespace}" get bdep "${name}" \
      -o jsonpath='{.status.message}' 2>/dev/null || true)"
    kubectl -n "${namespace}" get bdep "${name}" -o yaml 2>&1 || true
  } >&2
}

while [ "${elapsed}" -lt "${timeout}" ]; do
  phase="$(phase_now)"
  if [ "${phase}" = "${expected}" ]; then
    echo "the operator reports ${expected} (${awaited})"
    kubectl -n "${namespace}" get bdep
    exit 0
  fi
  if [ "${phase}" = "Failed" ]; then
    report
    exit 1
  fi
  sleep "${interval}"
  elapsed=$((elapsed + interval))
done

report
exit 1
