#!/bin/bash
set -e

# wait for up to 3 minutes for deployments in the blong-integration namespace to be ready
timeout=180
interval=5
elapsed=0
ns=blong-integration

# Deployment "Available" only means the pod started — mysqld first-boot runs the
# /docker-entrypoint-initdb.d init.sql and can restart before it serves the
# blong-admin user. Wait for a real query here to remove the cold-start race
# that drops the first suite connections in CI (PROTOCOL_CONNECTION_LOST).
wait_for_mysql() {
  echo "Waiting for MySQL to accept queries (mysqladmin ping + blong-admin SELECT 1)..."
  local wait_timeout=180
  local wait_interval=5
  local wait_elapsed=0
  local pod=""
  while [ $wait_elapsed -lt $wait_timeout ]; do
    pod=$(kubectl -n "${ns}" get pods -l app=mysql --no-headers -o custom-columns=":metadata.name" 2>/dev/null | head -1 || true)
    if [ -n "$pod" ] && \
       kubectl -n "${ns}" exec "$pod" -- mysqladmin ping -h localhost -u blong-admin -ppassword --silent >/dev/null 2>&1 && \
       kubectl -n "${ns}" exec "$pod" -- mysql -h localhost -u blong-admin -ppassword -e "SELECT 1" >/dev/null 2>&1; then
      echo "MySQL is ready (accepting queries for blong-admin)."
      return 0
    fi
    echo "MySQL not ready yet... ${wait_elapsed}s elapsed"
    sleep $wait_interval
    wait_elapsed=$((wait_elapsed + wait_interval))
  done
  echo "Timeout waiting for MySQL readiness after ${wait_timeout}s."
  if [ -n "$pod" ]; then
    echo "==== MySQL pod logs (last 100 lines) ===="
    kubectl -n "${ns}" logs "$pod" --tail=100 2>/dev/null || true
  fi
  return 1
}

# If args are provided, wait only for those deployments, otherwise wait for all
if [ "$#" -gt 0 ]; then
  deployments=("$@")
  echo "Waiting for deployments: ${deployments[*]} in ${ns} (timeout: ${timeout}s)..."
else
  mapfile -t deployments < <(kubectl -n "${ns}" get deployments --no-headers -o custom-columns=":metadata.name" 2>/dev/null || true)
  echo "Waiting for all deployments in ${ns} to be ready (timeout: ${timeout}s)..."
fi

total=${#deployments[@]}

if [ "$total" -eq 0 ]; then
  echo "No deployments found in namespace ${ns}."
  exit 0
fi

while [ $elapsed -lt $timeout ]; do
  available=0
  for d in "${deployments[@]}"; do
    status=$(kubectl -n "${ns}" get deployment "${d}" -o jsonpath='{.status.conditions[?(@.type=="Available")].status}' 2>/dev/null || true)
    if [ "${status}" = "True" ]; then
      available=$((available+1))
    fi
  done

  if [ "$available" -eq "$total" ]; then
    echo "All ${total} deployments are ready."
    break
  fi

  echo "Waiting for deployments to be ready... ${elapsed}s elapsed (${available}/${total} available)"
  sleep $interval
  elapsed=$((elapsed + interval))
done

# MySQL needs more than "pod Available" — mysqld first-boot (init.sql) must have
# run before suites connect, otherwise early connections get dropped.
if [ "$available" -eq "$total" ] && [[ " ${deployments[*]} " == *" mysql "* ]]; then
  wait_for_mysql
fi

if [ $elapsed -ge $timeout ]; then
  echo "Timeout waiting for deployments after ${timeout}s. Current status:"
  kubectl -n "${ns}" get deployments

  echo
  echo "Gathering last 50 logs for non-ready deployments:"
  for d in "${deployments[@]}"; do
    status=$(kubectl -n "${ns}" get deployment "${d}" -o jsonpath='{.status.conditions[?(@.type=="Available")].status}' 2>/dev/null || true)
    if [ "${status}" != "True" ]; then
      echo
      echo "==== Logs for deployment/${d} (last 50 lines) ===="
      if ! kubectl -n "${ns}" logs deployment/"${d}" --all-containers --tail=50 2>/dev/null; then
        echo "No logs available via deployment logs for ${d}, attempting pod logs..."
        # fallback: get pods for this deployment and print logs for each
        mapfile -t pods < <(kubectl -n "${ns}" get pods --selector="app=${d}" --no-headers -o custom-columns=":metadata.name" 2>/dev/null || true)
        if [ ${#pods[@]} -eq 0 ]; then
          # fallback: match pods by the ReplicaSet owner that starts with the deployment name
          mapfile -t pods < <(kubectl -n "${ns}" get pods --no-headers -o custom-columns=":metadata.name,:metadata.labels.app" 2>/dev/null | awk -v d="${d}" '$2==d {print $1}' || true)
        fi
        if [ ${#pods[@]} -eq 0 ]; then
          echo "No pods found for deployment ${d} to fetch logs from."
        else
          for p in "${pods[@]}"; do
            echo
            echo "--- Pod: ${p} ---"
            kubectl -n "${ns}" logs "${p}" --all-containers --tail=50 || echo "Failed to fetch logs for pod ${p}"
          done
        fi
      fi
    fi
  done

  exit 1
fi
