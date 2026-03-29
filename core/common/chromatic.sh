#!/bin/bash
set -e

if [[ "$CHROMATIC_PROJECT_TOKEN" == *$PWD* ]]; then
  CHROMATIC_PROJECT_TOKEN=$(echo "$CHROMATIC_PROJECT_TOKEN" | grep "^$PWD=" | sed "s/^$PWD=//")
fi

chromatic --exit-zero-on-changes
