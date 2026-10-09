# Kustomize deployment

How to generate and apply a suite's manifests.

## Generate

```bash
cd suite/blong-suite                 # the tree lands under the working directory
blong ./index.ts k8s
```

Writes `system/kustomize/` under the **current directory** — the default `outputDir` is a relative
path, so running the same command from the repository root writes a second, stray tree there rather
than into the suite. Override with `kustomize.deploy.outputDir`, the realm's `deploy` orchestrator
owning the plan. The directory is replaced, not merged.

The tree is written in two halves: a committed `base/` that holds what every deploy shares, and an
ignored `local/` beside it that holds what this deploy and this cluster own — the artifact's
identity and one fill Job per node (`layout: split`, D-475). An object whose _name_ names the
artifact cannot be patched into place, so the base carries it as a **template**
(`base/templates/<kind>/`, with `PLACEHOLDER` where the deploy's values go) and the overlay
instantiates it once per node, appending the identity with `nameSuffix`. The fill Job's script
travels in that template: it is the same text for every node because it reads its artifact, its root
and its count from the environment, so it needs neither a ConfigMap nor a mount. Deployments and the
suite's declaration stay in the base and are patched, because what they carry is a value rather than
a name. The operator asks for `flat` instead, one directory of composed objects, because it reads a
tree back and compares it with the cluster. Commit the base: the diff is the review.

## Configure the suite

```typescript
// the suite's config block
kustomize: {
    suite: {
        name: 'shop',
        version: '1.2.0',
        namespace: 'shop',            // defaults to the suite name
        frameworkImage: 'ghcr.io/feasibleone/blong-gogo',
        minFrameworkVersion: '1.38.1', // becomes the image tag
    },
    profile: 'realm',                  // namespace | realm | group | monolith
    groups: {platform: ['srv.*', 'core.*']}, // profile: group
    externalServices: {
        db: {externalName: 'mysql.backends.svc.cluster.local',
             ports: [{name: 'mysql', port: 3306}]},
    },
    services: {mysql: {storage: {size: '10Gi'}}}, // false to run that service yourself
    servicesNamespace: 'blong-services',
    storageClassName: 'local-path',
    suiteVolume: {backend: 'auto', retention: 3, attemptRetention: 5},
    portal: {web: {realm: 'core', host: 'ui.example.test', auth: {type: 'basic'}}},
    operator: {enabled: true, replicas: 1},
    crd: true,
}
```

| Key                       | Meaning                                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `profile`                 | `namespace`, `realm` (the default), `group` or `monolith` (one process)                                                                         |
| `groups`                  | `group` only — deployment name → `<realm>.<layer>` selectors                                                                                    |
| `externalServices`        | Abstract name → `ExternalName` alias for a third-party system, keyed by that name                                                               |
| `services`                | Per service: `false` (this deployment runs it), an object of overrides, or `true` only where an adapter implies it                              |
| `servicesNamespace`       | Where the generated service workloads run (default `blong-services`)                                                                            |
| `storageClassName`        | The class a generated claim asks for, where the descriptor names none                                                                           |
| `suiteVolume.backend`     | `auto` (default), `shared`, or `nodeLocal`                                                                                                      |
| `suiteVolume.retention`   | How many artifact directories stay on each node (default 3)                                                                                     |
| `suiteVolume.rwxProvider` | `openebs` — sets the class to `openebs-rwx`                                                                                                     |
| `suiteVolume.rwxManifest` | Remote manifest that installs the RWX provider                                                                                                  |
| `suiteVolume.artifact`    | `{source: 'url', url}` for the cluster, or `{source: 'path', path}` locally                                                                     |
| `portal.<alias>.realm`    | The realm whose own process serves the portal; omissible only with one process                                                                  |
| `portal.<alias>.host`     | The DNS name the portal answers on, and `.path` its prefix; the alias names the Service                                                         |
| `portal.<alias>.auth`     | `{type: 'basic', secretName?}` or `{type: 'oauth2', authUrl?}`                                                                                  |
| `operator`                | `{enabled?, replicas?, image?}` — the operator's Deployment (`enabled` defaults to false); its ServiceAccount, Role and ClusterRole always ship |
| `crd`                     | Also emit the CR that asks an installed operator for it                                                                                         |
| `outputDir`               | Where the tree is written (default `system/kustomize`)                                                                                          |

These settings belong in the suite's `default` block and **not** under `k8s`: the generator and the
operator process both read them, and a setting that appears only under `k8s` makes an operator pass
report objects it does not manage as drift (D-379). `suiteVolume.attemptRetention` is the same
number for the Job attempts a deploy leaves (default 5), and `suiteVolume.artifact.digest` — or
`deployedAt` — is what names the volume directory, so a rebuilt artifact under an unchanged version
is a new one rather than a rewrite (D-469, D-471). What a pod is handed belongs beside them —
`BLONG_NAMESPACE` from the downward API, which is what the Kubernetes resolver reads, `BLONG_ENV`
(the config names this process reads its rc files by — the deployment's intent list, whose trailing
name is the suffix `rc` builds its candidate paths from), `BLONG_LAYERS` (which layers this process
runs), `BLONG_CONTROLLER_*` for the operator's loop, one mount path for every container that touches
the volume, and an entry that has to be **absolute**, because the runner imports it as given rather
than resolving it against the working directory.

A `nodeLocal` pod mounts the artifact once, at `/opt/deploy/suite`, whichever identity it holds: the
fill rewrites the artifact's links as **relative** ones before it publishes the tree, so the
artifact reads from wherever it is mounted and no path has to be agreed on between the fill and its
readers (D-476).

## External services

A third-party system is declared by the abstract name the suite resolves — `db` — as a map rather
than as a list, for the same reason the portals below are: the suite's own config and the tenant's
CR each add entries without knowing about the other, and a merge of two lists pairs one entry's name
with another's ports. Declaring one is what a deployment does when it points at an installation
somebody else runs; when the framework can generate it, the same name arrives with the service.

## The services a deployment brings

An adapter kind implies a service — `knex` a MySQL, `s3` a MinIO, `kafka` a broker — and the plan
carries every implied one into the tree. The catalogue is `realm/blong-kustomize/services/`: one
descriptor per service, validated as it is read, so a service is added by adding a file and a
misspelled field fails loudly instead of generating nothing. A plan that activates no kind implying
one brings nothing.

```yaml
# realm/blong-kustomize/services/mysql.yaml
name: mysql
kinds: [knex]
image: mysql/mysql-server:8.0.32
port: {name: mysql, port: 3306}
storage: {size: 10Gi, mountPath: /var/lib/mysql}
credentials: {secret: mysql-credentials, keys: [MYSQL_USER, MYSQL_PASSWORD]}
values: {initScript: 'CREATE DATABASE IF NOT EXISTS `${db}`;'}
```

| Part of a descriptor | Meaning                                                                   |
| -------------------- | ------------------------------------------------------------------------- |
| `kinds`              | The adapter kinds that imply this service                                 |
| `image`, `port`      | What runs, and the name and number the alias publishes                    |
| `storage`            | The claim's size and mount path; the class, when the descriptor names one |
| `credentials`        | The Secret's name, and the keys its users are read by                     |
| `values`             | The scalars a base is rendered with (`initScript`, `internalPort`, …)     |

What a deployment says about them is a switchboard, keyed by service name:

| Value                              | Meaning                                                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `false`                            | This deployment runs that service itself: nothing of it is generated, so a name it still dials is declared under `externalServices` |
| `true`                             | Generated although no adapter implied it — refused when none does, because the workload would be one nothing dials                  |
| `{image?, storage?, credentials?}` | Generated, with `image`, `storage.size`, `storage.storageClassName` or `credentials.secret` overridden                              |

Generation writes, under `services/<name>/`: the workload from
`services/<name>/base/deployment.yaml` — a document whose `${…}` placeholders the plan fills, so the
base names nothing the plan decides — its `Service`, a claim when the descriptor declares storage,
an init ConfigMap built from the databases the plan's connections named, and a credentials Secret
whose values derive from suite, service and version, so the same plan writes the same Secret on
every pass. The `ExternalName` alias lands in `external-services/`, in the suite's namespace, which
is the name a realm's config dials.

`services`, `servicesNamespace` and `storageClassName` travel in the CR, because the operator
regenerates the tree from that declaration: a field the schema pruned is a service written back on
the next pass (T-279). `services.<name>` is accepted unpruned rather than typed, because Kubernetes
refuses a `type` or a `properties` inside an `anyOf` branch — a boolean would prune the overrides,
which is the same defect one pass later.

## Portals

A portal is an address and the process behind it, and a suite may publish several — as a map keyed
by alias, so a suite config, a CR and an overlay can each add one without knowing the others:

```typescript
portal: {
    shop: {realm: 'marine', host: 'shop.example.test', auth: {type: 'basic'}},
    admin: {realm: 'access', host: 'admin.example.test', auth: {type: 'oauth2', authUrl: 'https://id'}},
},
```

The key is the portal's name and it is what its Service is called (`<alias>-http`), which is why it
is a name a person chose: a deployment name follows the profile and would stop meaning the same
thing the moment the split changed. `realm` therefore names the process, not the deployment. A
portal that names no realm is allowed only where the suite has a single process, and a `companion` —
carried by every process and owning none — is refused rather than given someone else's. The tree
then emits one Service per portal and one Ingress per host, carrying every path that host serves: a
certificate and a DNS record belong to a host, so the portals and the webhooks realms contribute
land in one object. Two entries claiming one path on one host are refused, because the controller
would answer from whichever it read first. The annotations are the controller's and therefore the
host's: two portals on one host share them, and a realm's webhook may not share a portal's host at
all — the tree refuses it, because the alternative is a webhook behind the portal's authentication,
which an `oauth2` portal would answer with a browser redirect and a `basic` one with a password
prompt (T-241).

A portal usually belongs to the tenant rather than to the suite — the host is a DNS record and a TLS
certificate, and the auth is enforced by the controller the cluster runs — so a suite declares that
it publishes one and the tenant names the host in the `BlongDeployment`.

## Contribute from a layer

A component shapes its own deployment from its layer file — there is no separate descriptor to keep
in step (see `[K8S_CONTRIB]` in `.github/skills/_shared/conventions.md`):

```typescript
export default adapter(blong => ({
    extends: 'adapter.webhook',
    activation: {
        default: {namespace: 'webhook'},
        k8s: {
            k8sReplicas: 2,
            k8sResources: {requests: {cpu: '100m', memory: '128Mi'}},
            k8sPorts: [{name: 'metrics', port: 9090}],
            k8sIngresses: [
                {name: 'shop-webhook', path: '/webhook/shop', host: 'shop.example.test'},
            ],
            k8sEnv: [{name: 'SHOP_MODE', value: 'live'}],
            k8sManifests: [{apiVersion: 'v1', kind: 'ConfigMap', metadata: {name: 'shop-extra'}}],
        },
    },
}));
```

Objects deep-merge across the realms that share a deployment; arrays concatenate. An ingress with no
`serviceName` binds to the owning deployment's Service.

## Resolve names in the cluster

```typescript
resolution: {impl: 'kubernetes'},
```

`rpc-<namespace>` then resolves to `<namespace>.<namespace>.svc.cluster.local`, so the generated
Service is named after the namespace. The Service publishes the **RPC** port (8091) — the gateway's
8080 stays behind the Service of the process a portal fronts.

## Reconcile

The operator's loop reads its plan from the suite's `BlongDeployment` rather than from the registry
it runs, and passes over the cluster until the two agree: what the plan wants and the cluster does
not have is created, what differs is updated, what matches is left alone. Without `apply` a pass
only lists and reports; without `prune` on top of it nothing is deleted, because converging and
removing are different intentions.

| Setting    | Environment                 | Meaning                                                                                       |
| ---------- | --------------------------- | --------------------------------------------------------------------------------------------- |
| `interval` | `BLONG_CONTROLLER_INTERVAL` | Seconds between passes (60 by default)                                                        |
| `from`     | `BLONG_CONTROLLER_FROM`     | `cr` for the CR, `registry` for what this process runs                                        |
| `apply`    | `BLONG_CONTROLLER_APPLY`    | `true` writes, `false` reports the difference only                                            |
| `prune`    | `BLONG_CONTROLLER_PRUNE`    | `true` also removes what the declaration stopped naming, inside the suite's namespace (D-461) |
| `watch`    | —                           | Follow the CR and reconcile on change (config only)                                           |

The generated operator Deployment sets the four environment variables, because the container's
command line belongs to the image. `watch` is on for a CR pass and off otherwise; `false` leaves the
interval as the only trigger.

The watch is `kustomize.watch.run`, a handler and not part of the deploy orchestrator's loop,
because the loop reaches the adapter through another component and a stream does not survive that
request path: the reply arrives as `null`, which reads as "no events and nothing existing" (T-225,
T-227 in `core/blong-gogo`; `[REMOTE_BOUNDARY]` in `.github/skills/_shared/conventions.md` is the
rule). Through the handler proxy the same call returns the initial list and the generator whole, and
the list is what makes a restarted operator converge — every CR it sees is reconciled on each
renewal, which is also the resync. A long poll that runs out of time is a renewal, not a failure.

The migration Job is a **step, not a process**. The tree emits it ahead of the Deployments and a
pass waits for it before touching anything after it in `APPLY_ORDER`, because those read what the
step wrote; a Job that failed is **left where it is**, because that is what a failed deploy is read
from — its events and its logs — and the name carries the attempt (version and hash), so a retry is
a different object and nothing has to be deleted for it to exist (T-218, D-378, D-386). The reason a
served process must not migrate is the same reason: every pod starting at once would run the same
migration against the same schema.

What a pass calls _obsolete_ is what the plan no longer mentions among the objects **it manages** —
the suite's workloads, selected by the `blong.feasible.one/part-of` label. The kinds the install
owns are not in that set, so they can never be reported as drift, and nothing is deleted at all
without `prune`. With `prune` on, what a pass removes is scoped to the suite's namespace (D-461):
what a suite declares there — the `ExternalName` alias a realm's config dials among them — goes when
the declaration stops naming it, while a generated service's workload, claim and Service, which live
in a namespace of their own, are reported `obsolete` and left for whoever owns that namespace to
retire. Cluster-scoped objects are never removed, for the same reason the install owns them: the
rights the operator runs under are not the operator's to withdraw.

## Status

A pass that could have changed the cluster reports what it did in the CR's status subresource, and
`kubectl get bdep` shows the phase first:

```bash
kubectl get bdep -n shop
# NAME   SUITE   PROFILE    VOLUME      PHASE   OBSERVED
# shop   shop    monolith   nodeLocal   Ready   1.2.0
```

| Field             | Meaning                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `phase`           | `Failed`, `Ready`, or `Progressing` while a Deployment is not available                                                     |
| `observedVersion` | The version this operator has actually applied                                                                              |
| `message`         | One sentence: what happened, or what is still missing                                                                       |
| `deployments`     | Per Deployment, how many replicas are available — the evidence                                                              |
| `lastResult`      | The counts of the last pass, so a stale status can be told from a fresh one — `deleted` among them, for a pass that removes |

The write goes through the status subresource, so a role that may write the spec still cannot report
a deployment as reconciled without touching it. Two consequences are worth knowing: the CRD has to
declare every field the operator writes, because the API server drops an unknown status field rather
than rejecting it, and a custom-resource patch from this client is a JSON patch — the content type
is the generated client's choice, not the caller's (F-382).

## Apply

```bash
kubectl apply -k system/kustomize/local
```

A real apply orders `CustomResourceDefinition` before custom resources, so a tree carrying both
`crd/blongdeployment-crd.yaml` and the CR applies cleanly. A `--dry-run=server` cannot show that: it
installs nothing, so the CR reports `no matches for kind "BlongDeployment"` while the CRD itself
validates.

### What it takes for a code change to reach a pod

Three things, and each one alone leaves the old behaviour in place: the realm's handlers travel in
the **artifact** (`rush deploy`, then the zip the fill Job fetches), the framework's adapters travel
in the **image**, and the volume a tree names is a _directory_ — so a republished artifact is a new
identity, a new directory and a new fill Job, and the tree's apply is what fetches it. A running
operator says which half it got — the pre-fix loop logs its own request as its result
(`controller: pass … {"$meta":{"mtid":"request"…}}`), which is how a stale artifact was caught after
a local run had already reported the fix.

## Verify

```bash
kubectl kustomize system/kustomize/local                # renders base + overlay
kubectl apply -k system/kustomize/local --dry-run=server # validates against the cluster
```

`test/blong-int-kustomize` deploys to a local multi-node cluster; its `lib/` documents bringing an
image in with podman (`k3d image import` needs the docker API), which is how the first end-to-end
run was done. `SERVICE_OFF=<name>` runs the same runbook with that service switched off, which is
the variant the CI job runs after the default one: the alias goes and the generated workload stays,
which is what shows the switch reached the declaration and the prune respects the boundary.

## Serve another tenant

One operator can serve several suites, and only if each tenant grants it rights in its own
namespace. Two objects do the work, and they are the pair the installer's tree already holds under
`operator/`: the workload rules are namespaced, because that is all a `RoleBinding` can point at,
while the custom resource and its status are covered once by the generated `ClusterRole` beside it.

A tenant that has a `BlongDeployment` in `shop` copies the two objects, changes the namespace, and
binds the operator's ServiceAccount — the one that stays in the namespace which installed it:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata: {name: shop-operator, namespace: shop}
rules:
    - apiGroups: ['']
      resources: [services, configmaps, secrets, persistentvolumeclaims]
      verbs: [get, list, watch, create, update, patch, delete]
    - apiGroups: [apps]
      resources: [deployments, daemonsets, statefulsets]
      verbs: [get, list, watch, create, update, patch, delete]
    - apiGroups: [batch]
      resources: [jobs, cronjobs]
      verbs: [get, list, watch, create, update, patch, delete]
    - apiGroups: [networking.k8s.io]
      resources: [ingresses, networkpolicies]
      verbs: [get, list, watch, create, update, patch, delete]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata: {name: shop-operator, namespace: shop}
roleRef: {apiGroup: rbac.authorization.k8s.io, kind: Role, name: shop-operator}
subjects:
    - kind: ServiceAccount
      name: blong-operator # one operator per cluster, installed by its own tree
      namespace: blong-suite # where it was installed
```

The ClusterRole is installed once and lists `blongdeployments` and `blongdeployments/status`: a
namespace-scoped custom resource is still read through the cluster role that covers its group, so a
tenant adds no cluster-scoped object of its own. None of these objects is reconciled: the four RBAC
kinds are install-owned, because a pass that could write them could widen its own rights (the
cluster refuses it for the ServiceAccount the operator runs as). `OPERATOR_NAMESPACED_RULES` in
`realm/blong-kustomize/operator.ts` is the same list the generated `Role` holds — a kind the realm
may apply is a kind the operator may write, and a kind added to one without the other fails at apply
time with a 403 rather than at review.

## Reference

- `[K8S_CONTRIB]` — the contribution contract, in `_shared/conventions.md`.
- [kustomize](../concepts/kustomize.md) — what the realm does.
- [kustomize](../rationale/kustomize.md) — why it derives rather than asserts.
