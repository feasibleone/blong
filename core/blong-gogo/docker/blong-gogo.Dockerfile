ARG NODE_VERSION_BUILD=24.14.0
ARG NODE_VERSION=24.14.0-slim

# Build application dependencies
FROM node:${NODE_VERSION_BUILD} AS builder
WORKDIR /opt/app
COPY --parents rush.json common core/**/package.json docs/**/package.json ext/**/package.json core/**/bin ./
RUN node common/scripts/install-run-rush.js install
COPY --parents core/**/* ./
RUN node common/scripts/install-run-rush.js deploy -p @feasibleone/blong-gogo

# Final release image
FROM node:${NODE_VERSION_BUILD} as release
COPY --chown=node --from=builder --exclude=**/.rush --exclude=**/docker/ --exclude=**/rush-logs /opt/app/common/deploy /opt
WORKDIR /opt/app/blong-gogo
USER node

EXPOSE 8080
ENTRYPOINT [ "node" , "--watch", "./bin/blong.ts" ]

