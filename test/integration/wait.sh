#!/bin/bash

# wait for up to 1 minute for all deployments in the wanples-integration namespace to be ready
timeout=60
interval=1
elapsed=0

while [ $elapsed -lt $timeout ]; do
  if kubectl -n wanples-integration get deployments -o jsonpath='{.items[*].status.conditions[?(@.type=="Available")].status}' | grep -q "False"; then
    echo "Waiting for all deployments to be ready..."
    sleep $interval
    elapsed=$((elapsed + interval))
  else
    break
  fi
done

tap index.test.ts --allow-incomplete-coverage
