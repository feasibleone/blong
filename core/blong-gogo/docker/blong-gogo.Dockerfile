ARG NODE_VERSION_BUILD=24.14.0
ARG NODE_VERSION=24.14.0-slim

# Build application dependencies
FROM node:${NODE_VERSION_BUILD} AS builder
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsasl2-dev \
    libzstd-dev \
    liblz4-dev \
    libcurl4-openssl-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/blong
# The manifest layer: everything `rush install` reads and nothing else.
#
# `COPY --parents rush.json common core/**/package.json …` would express this in one instruction, and
# it is a BuildKit feature that podman's builder rejects ("COPY only supports the --chmod, --chown
# and --from flags", buildah 4.9.3) — while this image has to build with `podman build`, because that
# is what the dev-cluster runbook prescribes (D-369). Copying whole categories instead, as a first
# attempt did, put every source file above the install: any edit anywhere re-ran it, which is the
# dependency tree *and* `node-rdkafka`'s native build — ten to fifteen minutes (T-263, F-411).
#
# So the per-package copies are written out between the markers below and generated from `rush.json`:
#
#     node core/blong-gogo/docker/manifests.mjs --write   # after adding or removing a package
#     node core/blong-gogo/docker/manifests.mjs --check   # fails when the block is stale
#
# `common` carries the lockfile, the Rush configuration and the launcher the install runs, so it comes
# in whole — it is configuration, and `.dockerignore` keeps the store out of the context.
COPY rush.json ./
COPY common ./common
# BEGIN GENERATED package manifests
COPY tools/eslint/package.json ./tools/eslint/
COPY core/blong/package.json ./core/blong/
COPY core/blong/types/ut-function.merge/ ./core/blong/types/ut-function.merge/
COPY core/blong-chain/package.json ./core/blong-chain/
COPY core/blong-config/package.json ./core/blong-config/
COPY core/blong-template/package.json ./core/blong-template/
COPY tools/blong-dev/package.json ./tools/blong-dev/
COPY core/blong-lib/package.json ./core/blong-lib/
COPY core/blong-gogo/package.json ./core/blong-gogo/
COPY core/config-hot-reload/package.json ./core/config-hot-reload/
COPY tools/blong-graph/package.json ./tools/blong-graph/
COPY core/blong-browser/package.json ./core/blong-browser/
COPY core/blong-server/package.json ./core/blong-server/
COPY core/blong-mle/package.json ./core/blong-mle/
COPY core/blong-mock/package.json ./core/blong-mock/
COPY core/blong-kopi/package.json ./core/blong-kopi/
COPY realm/blong-commander/package.json ./realm/blong-commander/
COPY tools/blong-log/package.json ./tools/blong-log/
COPY realm/blong-login/package.json ./realm/blong-login/
COPY realm/blong-login/types/ut-function.cbc/ ./realm/blong-login/types/ut-function.cbc/
COPY core/blong-openapi/package.json ./core/blong-openapi/
COPY realm/blong-test/package.json ./realm/blong-test/
COPY demo/blong-eip/package.json ./demo/blong-eip/
COPY core/blong-cucumber/package.json ./core/blong-cucumber/
COPY core/blong-allure/package.json ./core/blong-allure/
COPY tools/blong-ttk/package.json ./tools/blong-ttk/
COPY test/blong-int-sql/package.json ./test/blong-int-sql/
COPY test/blong-int-adapter/package.json ./test/blong-int-adapter/
COPY test/blong-sim-tcp/package.json ./test/blong-sim-tcp/
COPY test/blong-sim-api/package.json ./test/blong-sim-api/
COPY demo/blong-hello/package.json ./demo/blong-hello/
COPY test/framework/package.json ./test/framework/
COPY docs/blong/package.json ./docs/blong/
COPY ext/rest-fs/package.json ./ext/rest-fs/
COPY demo/handler-test-poc/package.json ./demo/handler-test-poc/
COPY demo/blong-marine/package.json ./demo/blong-marine/
COPY realm/blong-core/package.json ./realm/blong-core/
COPY realm/blong-access/package.json ./realm/blong-access/
COPY realm/blong-access-mock/package.json ./realm/blong-access-mock/
COPY realm/blong-gateway/package.json ./realm/blong-gateway/
COPY realm/blong-party/package.json ./realm/blong-party/
COPY demo/marine-data/package.json ./demo/marine-data/
COPY suite/blong-suite/package.json ./suite/blong-suite/
COPY core/blong-lint/package.json ./core/blong-lint/
COPY core/blong-kukum/package.json ./core/blong-kukum/
COPY demo/blong-cli/package.json ./demo/blong-cli/
COPY core/semantic-log/package.json ./core/semantic-log/
COPY test/blong-ci-report/package.json ./test/blong-ci-report/
COPY core/blong-realm/package.json ./core/blong-realm/
COPY realm/blong-kustomize/package.json ./realm/blong-kustomize/
# END GENERATED package manifests
# The Node headers this image was built from, for `node-gyp`: `node-rdkafka` (a dependency of
# `blong-gogo`, and the only native build here) is compiled against them, and without this node-gyp
# downloads the headers it wants from nodejs.org first. That download stalls — it held a local build
# at 2.4 GB written, a socket open and no progress for twelve minutes (F-409), where the headers are
# already at `/usr/local/include/node` in this very image.
ENV npm_config_nodedir=/usr/local
RUN node common/scripts/install-run-rush.js install --to @feasibleone/blong-gogo
# The sources, *after* the install: a manifest change re-installs, a source change does not.
COPY core ./core
COPY realm ./realm
COPY test ./test
COPY suite ./suite
COPY demo ./demo
COPY tools ./tools
COPY docs ./docs
COPY ext ./ext
RUN node common/scripts/install-run-rush.js deploy -p @feasibleone/blong-gogo && \
    cd common/deploy && \
    node create-links.js create && \
    rm create-links.js && \
    rm -rf .rush && \
    find . -type d -name docker -prune -exec rm -rf {} + && \
    find . -type d -name rush-logs -prune -exec rm -rf {} +

# Final release image
FROM node:${NODE_VERSION} AS release
# `curl` and `unzip` are here for the deployer: the seeder container downloads a
# suite artifact and unpacks it into the mounted volume, and `blong-kustomize`
# generates that container from this image.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcurl4 \
    libssl3 \
    libsasl2-2 \
    libsasl2-modules \
    libzstd1 \
    liblz4-1 \
    zlib1g \
    ca-certificates \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*
COPY --chown=node --from=builder /opt/blong/common/deploy /opt/blong/common/deploy
RUN ln -s /opt/blong/common/deploy/core/blong-gogo/bin/blong.ts /usr/local/bin/blong && \
    ln -s /opt/blong/common/deploy/core/blong-gogo/bin/blong-watch.ts /usr/local/bin/blong-watch
WORKDIR /opt/deploy
USER node

EXPOSE 8080
ENTRYPOINT [ "node" , "/opt/blong/common/deploy/core/blong-gogo/bin/blong.ts" ]
