#!/bin/bash
set -e

# wait for up to 3 minutes for all deployments in the blong-integration namespace to be ready
timeout=180
interval=5
elapsed=0

echo "Waiting for all deployments in blong-integration to be ready (timeout: ${timeout}s)..."

while [ $elapsed -lt $timeout ]; do
  total=$(kubectl -n blong-integration get deployments --no-headers 2>/dev/null | wc -l | tr -d ' ')
  available=$(kubectl -n blong-integration get deployments -o jsonpath='{.items[*].status.conditions[?(@.type=="Available")].status}' 2>/dev/null | tr ' ' '\n' | grep -c "True" || true)
  if [ "$total" -gt 0 ] && [ "$available" -eq "$total" ]; then
    echo "All ${total} deployments are ready."
    break
  fi
  echo "Waiting for deployments to be ready... ${elapsed}s elapsed (${available}/${total} available)"
  sleep $interval
  elapsed=$((elapsed + interval))
done

if [ $elapsed -ge $timeout ]; then
  echo "Timeout waiting for deployments after ${timeout}s. Current status:"
  kubectl -n blong-integration get deployments
  exit 1
fi

# kubectl logs deployment/mysql --namespace blong-integration
