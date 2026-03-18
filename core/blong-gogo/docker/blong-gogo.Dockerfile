ARG NODE_VERSION_BUILD=24.14.0
ARG NODE_VERSION=24.14.0-slim

# Build application dependencies
FROM node:${NODE_VERSION_BUILD} AS builder
WORKDIR /opt/blong
COPY --parents rush.json common core/**/package.json core/**/bin ./
RUN node common/scripts/install-run-rush.js install --to @feasibleone/blong-gogo
COPY --parents core/**/* ./
RUN node common/scripts/install-run-rush.js deploy -p @feasibleone/blong-gogo && \
    cd common/deploy && \
    node create-links.js create && \
    rm create-links.js

# Final release image
FROM node:${NODE_VERSION} AS release
COPY --chown=node --from=builder --exclude=**/.rush --exclude=**/docker/ --exclude=**/rush-logs /opt/blong/common/deploy /opt/blong/common/deploy
RUN ln -s /opt/blong/common/deploy/core/blong-gogo/bin/blong.ts /usr/local/bin/blong && \
    ln -s /opt/blong/common/deploy/core/blong-gogo/bin/blong-dev.ts /usr/local/bin/blong-dev
WORKDIR /opt/deploy
USER node

EXPOSE 8080
ENTRYPOINT [ "node" , "/opt/blong/common/deploy/core/blong-gogo/bin/blong.ts" ]
