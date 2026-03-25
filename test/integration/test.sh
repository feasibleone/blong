#!/bin/bash
rush deploy --project @feasibleone/release
docker run -it --rm -e CI -e BLONG_MASTER_KEY -w /opt/deploy/app/release -v ./common/deploy:/opt/deploy ghcr.io/feasibleone/blong-gogo:v1.13.8
