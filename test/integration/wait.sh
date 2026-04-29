#!/bin/bash
set -e

# wait for up to 3 minutes for deployments in the blong-integration namespace to be ready
timeout=180
interval=5
elapsed=0
ns=blong-integration

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
