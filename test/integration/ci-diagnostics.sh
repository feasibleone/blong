#!/bin/bash
# Collect CI failure diagnostics for the k3d integration environment: Kubernetes
# events, MySQL pod state and logs, resource usage, and MySQL server status.
# Written to <out-dir>/ci-diagnostics.txt so the shared rush workflow can upload
# it as a CI artifact when tests fail.
#
# Usage: ci-diagnostics.sh [namespace] [out-dir]
#   namespace  Kubernetes namespace of the integration services (default: blong-integration)
#   out-dir    directory to write ci-diagnostics.txt into (default: ci-debug)
set -u

NS="${1:-blong-integration}"
OUT_DIR="${2:-ci-debug}"
mkdir -p "$OUT_DIR"

{
    echo "=== kubectl get events -n ${NS} (newest last) ==="
    kubectl get events -n "$NS" --sort-by=.lastTimestamp 2>&1 || true
    echo
    echo "=== kubectl describe pod -l app=mysql ==="
    kubectl describe pod -l app=mysql -n "$NS" 2>&1 || true
    echo
    echo "=== kubectl top pods -n ${NS} ==="
    kubectl top pods -n "$NS" 2>&1 || true
    echo
    echo "=== MySQL pod logs (current container, last 200) ==="
    kubectl logs -l app=mysql -n "$NS" --tail=200 2>&1 || true
    echo
    echo "=== MySQL pod logs (previous/crashed container, last 200) ==="
    kubectl logs -l app=mysql -n "$NS" --previous --tail=200 2>&1 || true
    echo
    echo "=== MySQL status / limits ==="
    MYSQL_POD=$(kubectl get pods -n "$NS" -l app=mysql -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
    if [ -n "$MYSQL_POD" ]; then
        kubectl exec -n "$NS" "$MYSQL_POD" -- mysql -u root -e \
            "SHOW GLOBAL STATUS LIKE 'Threads_connected'; SHOW GLOBAL STATUS LIKE 'Threads_running'; SHOW GLOBAL STATUS LIKE 'Aborted_connects'; SHOW GLOBAL STATUS LIKE 'Connection_errors_%'; SHOW GLOBAL VARIABLES LIKE 'max_connections'; SHOW GLOBAL VARIABLES LIKE 'wait_timeout';" 2>&1 || true
    fi
} > "$OUT_DIR/ci-diagnostics.txt" 2>&1 || true

echo "CI diagnostics written to $OUT_DIR/ci-diagnostics.txt"
