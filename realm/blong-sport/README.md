# blong-sport

The sport management realm: athletes, coaches, specialists, competitions, awards and the documents
and affiliations around them. It is a Blong realm, so it is deployed the same way any other suite is
— a plan, a generated kustomize tree, an artifact and an operator — and this page is what is
specific to it.

## Deployment

`realm/blong-sport` is also a **suite entry**: `index.ts` is the deployable process and the
standalone server bootstrap the realm's tests use. Its `default` block carries the
`kustomize.deploy` settings, the `release` block carries the database connection and the static
browser root, and the `k8s` and `upgrade` blocks name every realm a planning run and the migration
Job need.

- **Artifact** — `sport.zip`, from `rush deploy --scenario sport`
  (`common/config/rush/deploy-sport.json`).
- **Entry in the artifact** — `/opt/deploy/suite/realm/blong-sport/index.ts`.
- **Browser bundle** — `/opt/deploy/suite/realm/blong-sport/dist` (`npm run build` → `vite build`).
- **Namespace and suite** — `blong-sport`, profile `monolith` (one process).
- **Portal** — the host named by `kustomize.deploy.portal.web.host` in `.blong_k8src`, certificate
  `sport-tls` from cert-manager.
- **Database** — the dev cluster's MySQL, through the `db` ExternalName alias, schema `blong-sport`.
- **Release trigger** — `https://<operator host>/rpc/kustomize/release/approve`, the route the
  operator's ingress serves.

The committed design half is `system/kustomize/base/`; `system/kustomize/local/` is this machine's
deploy and is ignored. Regenerate the base with:

```bash
cd realm/blong-sport
blong ./index.ts k8s --kustomize.deploy.layout=base
```

The `release-please` component is `realm/blong-sport`, so a `blong-sport-v<version>` release is what
the deployment workflow follows. `.github/deployments.json` names the package, scenario, artifact
and namespace; the workflow builds the zip from the release tag, attaches it to the release and
calls the operator with its URL and sha256.

### Local deploy

The k3d runbook in `test/blong-int-kustomize/` deploys the same artifact without GitHub:

```bash
cd realm/blong-sport
CLUSTER=dev-cluster NAMESPACE=blong-sport \
SUITE_PACKAGE=realm/blong-sport SUITE_ENTRY=./index.ts \
SUITE_SCENARIO=sport ARTIFACT_NAME=sport.zip \
BUILD_IMAGE=0 BUILD_SUITE=1 PUBLISH_ARTIFACTS=1 REFRESH=1 ASSUME_YES=1 \
BLONG_TEST_USER=testAdmin BLONG_TEST_PASSWORD=testPassword \
node --conditions=development ../../test/blong-int-kustomize/bin/blongIntKustomize.ts cycle run
```

It returns `prepared: true` for the machine half and `done: true` once the migration Job, the portal
checks and the login round trip pass. The operator is installed into `blong-system` by the same
runbook; its token Secret is `blong-operator-release`.

### Test seeds

`meta/dbTest/*.yaml` is dev and integration material, and the shared db adapter is what turns it on
for those intents. Neither this realm nor `blong-party` pins `schema.dbTest` itself: an `upgrade` or
`release` process does not load the `dbTest` handler groups, so a test seed dispatched there falls
through to the generic merge and fails on a body it does not have. The migration step seeds
`blong-access`'s `testAdmin` explicitly for the local portal round trip; a real deployment supplies
its own administrator.
