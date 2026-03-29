#!/bin/bash
set -e

if [[ "$CHROMATIC_PROJECT_TOKEN" == *$(basename "$PWD")* ]]; then
  CHROMATIC_PROJECT_TOKEN=$(echo "$CHROMATIC_PROJECT_TOKEN" | grep "^$(basename "$PWD")=" | sed "s/^$(basename "$PWD")=//")
fi

chromatic --exit-zero-on-changes
