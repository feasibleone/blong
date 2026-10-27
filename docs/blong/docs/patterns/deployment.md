# Continuous deployment to a local k3d cluster

The repository deploys a suite the same way a released product would: an operator converges a
`BlongDeployment`, a release workflow builds the artifact, and the operator's gateway is the only
door the workflow opens. `realm/blong-sport` is the worked example; the mechanism is generic.

## The three halves

- **Operator** — one per cluster, installed once, reconciling every tenant's CR; in
  `realm/blong-kustomize`.
- **Artifact** — the `rush deploy` scenario, zipped and fetched by the fill Job from a URL; the
  release asset.
- **Trigger** — the token-gated `kustomize.release.approve` route on the operator's gateway, at the
  address the installer names in `kustomize.deploy.operator.ingress.host`.

The suite's tree never carries the operator: it carries the CR, and the bindings the operator needs
in the suite's namespaces. The operator's own install tree carries the CRD, its RBAC, the
`BLONG_RELEASE_TOKEN` reference and the ingress. The two are applied from
`system/operator/local` and the suite's `system/kustomize/local` respectively.

## `.github/deployments.json`

The deployment map is the only place a suite is named. A key is the alias a human dispatches, and
its fields are what the workflow reads:

```json
{
    "sport": {
        "release": "blong-sport",
        "package": "@feasibleone/blong-sport",
        "packagePath": "realm/blong-sport",
        "scenario": "sport",
        "artifact": "sport.zip",
        "namespace": "blong-sport",
        "suite": "blong-sport",
        "entry": "./index.ts",
        "profile": "monolith"
    }
}
```

`release` is the release-please component, so the release tag is `<release>-v<version>`.
`scenario` names both `common/config/rush/deploy-<scenario>.json` and the kustomize deploy scenario;
`artifact` is the name the zip is published under; `suite` and `namespace` are the CR's name and
tenant. A second suite is a second key plus its scenario file — the workflow does not change.

One entry is not a tenant's suite at all: the deployment realm's own install, marked
`"installer": true`, which `resolve` skips when it looks for the alias a tag names. It is there for
the other readers of the map — the workflow job that publishes the operator's artifact, and
`realm/blong-kustomize/deploy.sh`, which resolves a released artifact's URL from the same record
rather than hardcoding a prefix in a shell script:

```json
{
    "operator": {
        "installer": true,
        "release": "blong-kustomize",
        "package": "@feasibleone/blong-kustomize",
        "packagePath": "realm/blong-kustomize",
        "scenario": "operator",
        "artifact": "blong-kustomize.zip"
    }
}
```

No address is in the map: a host belongs to the machine that deploys, so the operator's comes from
`.blong_k8src` and the suite's portal host from the same file — see
[where an address comes from](#where-an-address-comes-from).

## `.github/workflows/deploy.yaml`

The workflow has one trigger that matters for releases and one for people:

- `release: types: [published]` — release-please has merged the version pull request and published
  the component's release.
- `workflow_dispatch` with `deployment` and `tag` — a re-deploy, or a deployment whose release was
  published earlier.

A release that names no deployment is not a failure. Release-please publishes its batch at once —
one release per changed package — and most of those tags belong to components nobody deploys, so
`resolve` reports an empty alias and both later jobs are skipped. Only a tag the map names runs a
build and a call.

`resolve` turns the tag into the alias, the suite version and the framework version. The framework
version is read from `.release-please-manifest.json` at the tag (`core/blong-gogo`), and the job
waits for `ghcr.io/feasibleone/blong-gogo:v<gogoVersion>` to exist — a release is not a promise that
its image is pullable yet.

`artifact` checks out the tag, installs, builds `--to <package>`, runs `rush deploy --scenario
<scenario>`, zips the target folder, hashes it and attaches it to the release with `gh release
upload`. The URL the operator receives is the public release asset URL; the digest is the sha256 of
the bytes that were uploaded.

`operator-artifact` is the same work for the installer rather than for a tenant: it answers a
`blong-kustomize-v<version>` release and attaches three assets — `blong-kustomize-<version>.zip`, its
`.sha256`, and `blong-kustomize.zip` as a stable alias for `releases/latest/download/`, which is the
name the install tree falls back to. The versioned name is what a version installs and the next
release cannot overwrite; the digest is an asset rather than a sentence in the release notes because
it is a script that reads it, and what it names is the directory the artifact lands in.

`deploy` builds the JSON-RPC body with `jq -n --arg` — never shell interpolation, because the token
and the URL are data — and posts it to `secrets.DEPLOY_ENDPOINT` with
`secrets.DEPLOY_TOKEN`. The route is plain JSON-RPC over HTTPS: the gate is the token, not a bearer
or an MLE handshake, and the ingress certificate protects it in transit.

```bash
# The route the operator's ingress serves, and the token the operator reads from its Secret.
DEPLOY_ENDPOINT=https://<operator host>/rpc/kustomize/release/approve
DEPLOY_TOKEN=<the same value as the operator's blong-operator-release secret>
```

A wrong or missing token is answered `401` with `kustomize.release.tokenMismatch` or
`kustomize.release.tokenMissing`; the CR is untouched, because the check happens before the notify
handler. A correct token patches the CR's `version`, `suiteVolume.artifact` (URL and digest) and,
when the release moved it, `minFrameworkVersion`, and the operator converges.

## Where an address comes from

A host is a DNS record and a certificate somebody owns, so it is configuration rather than a value in
a source tree: no realm, workflow or committed manifest names one. The framework reads the file of
the `k8s` intent — `.blong_k8src`, found from the working directory upwards — and its
`kustomize.deploy` block supplies the addresses of both halves:

```yaml
kustomize:
    deploy:
        operator:
            ingress:
                host: <the operator's host>
                tls: {secretName: blong-operator-tls}
                annotations:
                    cert-manager.io/cluster-issuer: letsencrypt-prod
        portal:
            web:
                host: <the suite's portal host>
                annotations:
                    cert-manager.io/cluster-issuer: letsencrypt-prod
```

The file is ignored (`.blong_*`) and local to the machine. The repository's copy names the operator's
address, which every `k8s` run reads; a suite's portal address lives beside the suite that declares
the portal — `realm/blong-sport/.blong_k8src` — because the alias is the suite's own and a shared file
would hand one suite's host to the next. `rc` takes the closest file, so a package's copy shadows the
repository's for runs started in it.

`cert-manager.io/cluster-issuer` is the switch between the two ClusterIssuers: `letsencrypt-staging`
issues quickly and untrusted — a browser warns and `curl` needs `-k` — while `letsencrypt-prod`
issues a publicly trusted certificate and counts against Let's Encrypt's rate limit. Changing the
annotation and re-running the cycle is the whole switch; cert-manager notices that the Secret's
certificate came from another issuer and re-issues.

What a deployment publishes stays out of the repository's generated half. A split tree keeps the
Ingress in `local/`, which is not committed, for the same reason it keeps the artifact's digest and
the node names there; the base every deployment of the suite shares carries no address at all. The
declaration follows the same rule: `local/declaration/blongdeployment.yaml` is the CR a run applies,
with the real host, and `example/blongdeployment.yaml` beside the base is the sample a tenant copies,
with the host written as `PLACEHOLDER`.

## The cluster prerequisites

- **Traefik and cert-manager.** The operator and portal ingresses carry a `tls.secretName` and a
  `cert-manager.io/cluster-issuer` annotation; cert-manager turns them into certificates. Without an
  ingress controller the hostnames answer nothing, and without cert-manager the secrets never exist.
  cert-manager itself is a chart, not a vendored manifest: `test/integration/cert-manager` declares
  `helmCharts:` (name, repo and a pinned `version`) and the Namespace the chart does not create, so
  the install is applied as `kubectl kustomize --enable-helm test/integration/cert-manager | kubectl
  apply -f -`. `apply -k` cannot read `helmCharts` — the inflator is a flag on `kustomize build`,
  it needs a `helm` binary on PATH, and it pulls the chart at build time.
- **Host ports.** Rootless Podman cannot bind privileged ports, so the k3d load balancer publishes
  host `8080`/`8443` and forwards them to Traefik's `80`/`443`; the router does the public half.
- **ServiceLB.** Traefik is a `LoadBalancer`, so k3d's ServiceLB has to stay enabled; disabling it
  leaves the address pending and the load balancer with no backend.
- **The release Secret.** `blong-operator-release` holds `token`, referenced `optional: true` by the
  operator Deployment. Absent, the operator starts and the route refuses rather than the pod waiting
  in `CreateContainerConfigError`.

## Proving it locally

`test/blong-int-kustomize` is the same cycle without GitHub: its `machine prepare` builds and
publishes the operator and suite zips to a file server in the cluster, and its `suite deploy` applies
the generated trees, waits for the migration Job, checks the portal and logs in. `realm/blong-sport`
is deployed with `SUITE_SCENARIO=sport ARTIFACT_NAME=sport.zip`; see its README for the command. The
runbook and the workflow differ in where the artifact comes from, not in what a correct deployment
is.
