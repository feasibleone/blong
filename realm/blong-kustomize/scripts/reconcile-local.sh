#!/usr/bin/env bash
#
# reconcile-local.sh — run one CR-origin reconcile pass from this machine, against a dev cluster.
#
# Why this exists (T-251). The operator reconciles a CR it does not hold by starting a short-lived
# child that loads the *suite's artifact*, and the CR names that artifact as a URL the cluster fetches.
# A pass run from a laptop cannot fetch it — the URL belongs to the cluster's network — so the probe
# patches that one field to a local `path` for the duration of the pass and puts it back afterwards, in
# a trap: a CR left naming a laptop directory is a DaemonSet on every node trying to fetch a file that
# is not there. `source: 'path'` is read in place rather than fetched
# (`orchestrator/generate/kustomizeArtifactFetch.ts`), which is what makes the patch enough.
#
# What it is for: the CR path is otherwise only exercised by the operator itself, so a defect in it —
# the Job looked up by the suite's label instead of the attempt's, F-398 — is found by watching a
# cluster converge. This runs the same pass on demand and prints what it found.
#
# Usage
#   bash realm/blong-kustomize/scripts/reconcile-local.sh [--artifact=<dir>] [--apply] [--prune]
#       [--name=<cr>] [--namespace=<ns>]
#
#   --artifact   an unpacked suite artifact (the output of `rush deploy --scenario suite`, or the
#                `/tmp/blong-cycle-suite` the dev cycle leaves behind). Default that path.
#   --apply      apply the difference instead of only reporting it. Off by default: a probe that
#                changes a cluster by accident is worse than one that reports, and the artifact is
#                part of the tree — the objects that name it are compared against the *patched* value,
#                so a pass with `--apply` writes the laptop's directory into them.
#
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
NS="${NAMESPACE:-blong-suite}"
ARTIFACT="${ARTIFACT:-/tmp/blong-cycle-suite}"
APPLY=0
PRUNE=""
NAME=""

for argument in "$@"; do
    case "${argument}" in
        --artifact=*) ARTIFACT="${argument#*=}" ;;
        --apply) APPLY=1 ;;
        --prune) PRUNE="--prune" ;;
        --name=*) NAME="${argument#*=}" ;;
        --namespace=*) NS="${argument#*=}" ;;
        *) echo "unknown argument: ${argument}" >&2; exit 2 ;;
    esac
done

if [[ ! -d "${ARTIFACT}" ]]; then
    echo "FAIL: no artifact at ${ARTIFACT} — pass --artifact=<unpacked suite artifact>" >&2
    exit 1
fi

# The links the deployed tree resolves through, written by the artifact's own script — the step the
# container performs after unpacking, and the one thing a `path` artifact read *in place* still needs:
# without it the child dies with `Cannot find package '@feasibleone/blong'` before the pass begins.
if [[ -f "${ARTIFACT}/create-links.js" ]]; then
    (cd "${ARTIFACT}" && node create-links.js create >/dev/null)
fi

CR="$(kubectl -n "${NS}" get blongdeployment -o name 2>/dev/null | head -1 || true)"
if [[ -z "${CR}" && -n "${NAME}" ]]; then
    CR="blongdeployment/${NAME}"
fi
if [[ -z "${CR}" ]]; then
    echo "FAIL: no BlongDeployment in ${NS} to reconcile" >&2
    exit 1
fi

# The artifact field as it is now, so the trap restores the cluster's own value rather than a guess:
# `null` is a CR that named none, and writing that back is what removes the patch.
BEFORE="$(kubectl -n "${NS}" get "${CR}" -o jsonpath='{.spec.suiteVolume.artifact}' 2>/dev/null || true)"
[[ -n "${BEFORE}" && "${BEFORE}" != "null" ]] || BEFORE="null"

restore() {
    kubectl -n "${NS}" patch "${CR}" --type=merge \
        -p "{\"spec\":{\"suiteVolume\":{\"artifact\":${BEFORE}}}}" >/dev/null
    echo "== restored ${CR} to the artifact it carried =="
}
trap restore EXIT

echo "== pointing ${CR} at ${ARTIFACT} for the duration of one pass =="
kubectl -n "${NS}" patch "${CR}" --type=merge \
    -p "{\"spec\":{\"suiteVolume\":{\"artifact\":{\"source\":\"path\",\"path\":\"${ARTIFACT}\"}}}}" >/dev/null

# Report only unless asked otherwise: the pass is the thing under test, and `--apply` is a decision
# about a cluster rather than part of running the probe.
echo "== one pass (apply=$([[ ${APPLY} == 1 ]] && echo yes || echo no)) =="
(
    cd "${ROOT}/realm/blong-kustomize"
    node --conditions=development "${ROOT}/realm/blong-kustomize/bin/kustomize.ts" reconcile \
        --from=cr \
        --namespace="${NS}" \
        ${NAME:+--name="${NAME}"} \
        ${PRUNE} \
        $([[ ${APPLY} == 1 ]] && echo --apply)
)
