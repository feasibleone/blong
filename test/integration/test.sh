#!/bin/bash
rush deploy --project @feasibleone/release
docker run --rm -e CI -e BLONG_MASTER_KEY --network host -w /opt/deploy/app/release -v ./common/deploy:/opt/deploy ghcr.io/feasibleone/blong-gogo:v1.13.8
