#!/bin/bash
# Collect CI failure diagnostics for the k3d integration environment: the
# backends it starts (events, MySQL pod state and logs, resource usage, server
# status) and the workloads a step was waiting for. Written to
# <out-dir>/ci-diagnostics.txt so the shared rush workflow can upload it as a CI
# artifact when tests fail.
#
# Usage: ci-diagnostics.sh [out-dir] [namespace...]
#   out-dir     directory to write ci-diagnostics.txt into (default: ci-debug)
#   namespace   a namespace to dump in addition to the integration backends — the
#               kustomize runbook passes blong-suite and blong-services
#
# The backends answer "did the environment come up"; the namespaces answer the
# other half — "what did the workloads say" — and only that half explains a step
# that waited ten minutes and gave up. A pod in CrashLoopBackOff, a Job that
# failed, and the line the process printed before it exited are all gone when the
# run ends, and none of them is in the events (@@T-839).
set -u

INTEGRATION_NS="${INTEGRATION_NAMESPACE:-blong-integration}"
OUT_DIR="${1:-ci-debug}"
shift || true
WORKLOAD_NS=("$@")

mkdir -p "$OUT_DIR"

# One pod's logs, current container and the previous one: a restarted container
# keeps the failure in `--previous`, and the current one may be a fresh start
# that has said nothing yet.
pod_logs() {
    local ns="$1" pod="$2"
    echo "--- ${ns}/${pod} (current container, last 200)"
    kubectl -n "$ns" logs "$pod" --all-containers --tail=200 2>&1 || true
    echo "--- ${ns}/${pod} (previous container, last 200)"
    kubectl -n "$ns" logs "$pod" --all-containers --previous --tail=200 2>&1 || true
}

{
    echo "=== kubectl get events -n ${INTEGRATION_NS} (newest last) ==="
    kubectl get events -n "$INTEGRATION_NS" --sort-by=.lastTimestamp 2>&1 || true
    echo
    echo "=== kubectl describe pod -l app=mysql ==="
    kubectl describe pod -l app=mysql -n "$INTEGRATION_NS" 2>&1 || true
    echo
    echo "=== kubectl top pods -n ${INTEGRATION_NS} ==="
    kubectl top pods -n "$INTEGRATION_NS" 2>&1 || true
    echo
    echo "=== MySQL pod logs (current container, last 200) ==="
    kubectl logs -l app=mysql -n "$INTEGRATION_NS" --tail=200 2>&1 || true
    echo
    echo "=== MySQL pod logs (previous/crashed container, last 200) ==="
    kubectl logs -l app=mysql -n "$INTEGRATION_NS" --previous --tail=200 2>&1 || true
    echo
    echo "=== MySQL status / limits ==="
    MYSQL_POD=$(kubectl get pods -n "$INTEGRATION_NS" -l app=mysql -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
    if [ -n "$MYSQL_POD" ]; then
        kubectl exec -n "$INTEGRATION_NS" "$MYSQL_POD" -- mysql -u root -e \
            "SHOW GLOBAL STATUS LIKE 'Threads_connected'; SHOW GLOBAL STATUS LIKE 'Threads_running'; SHOW GLOBAL STATUS LIKE 'Aborted_connects'; SHOW GLOBAL STATUS LIKE 'Connection_errors_%'; SHOW GLOBAL VARIABLES LIKE 'max_connections'; SHOW GLOBAL VARIABLES LIKE 'wait_timeout';" 2>&1 || true
    fi

    # The workloads: what the step waited for, in the words of the pods. Every pod
    # that is not ready is asked for its logs, because "exceeded its progress
    # deadline" is a symptom and the container's last line is the cause.
    for ns in "${WORKLOAD_NS[@]}"; do
        [ -n "$ns" ] || continue
        echo
        echo "=== ${ns}: pods ==="
        kubectl -n "$ns" get pods -o wide 2>&1 || true
        echo
        echo "=== ${ns}: events (newest last) ==="
        kubectl get events -n "$ns" --sort-by=.lastTimestamp 2>&1 | tail -40 || true
        echo
        echo "=== ${ns}: why each pod is not running ==="
        for pod in $(kubectl -n "$ns" get pods -o name 2>/dev/null || true); do
            pod="${pod#pod/}"
            ready=$(kubectl -n "$ns" get "$pod" -o jsonpath='{.status.containerStatuses[*].ready}' 2>/dev/null || true)
            case "$ready" in
            *false* | '') pod_logs "$ns" "$pod" ;;
            esac
        done
        echo
        echo "=== ${ns}: jobs and their logs ==="
        for job in $(kubectl -n "$ns" get jobs -o name 2>/dev/null || true); do
            echo "--- ${job}"
            kubectl -n "$ns" logs "${job}" --all-containers --tail=100 2>&1 || true
        done
    done
} > "$OUT_DIR/ci-diagnostics.txt" 2>&1 || true

echo "CI diagnostics written to $OUT_DIR/ci-diagnostics.txt"
