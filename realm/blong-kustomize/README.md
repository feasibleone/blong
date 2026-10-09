# @feasibleone/blong-kustomize

Deployment for Blong suites: it turns a loaded suite into a kustomize tree, a versioned suite volume
and a `BlongDeployment` the operator can reconcile.

The realm is a **bare-cluster installer**. It loads no business realm, needs no database and depends
on no third-party service: everything it knows comes from the loaded registry and everything it
writes goes to `system/kustomize/`.

## The `k8s` intent

```bash
blong ./suite/blong-suite/index.ts k8s
```

`k8s` is a short-lived intent (like `cli` and `db`): the process serves nothing, introspects the
registry, writes the tree and exits. A throw during generation exits non-zero, so a broken tree
fails the build rather than being committed.

There is no flag for "am I generating": the realm writes only when the `k8s` activation block set
`generateManifests`, so a process that loads the realm for its read API never generates while one
that does not can still deploy it.

Where the realm loads is deliberate, and the framework's own realm list is where it says so: under
the `k8s` intent (the short-lived generator), and in any process that names the realm itself — its
own entry, its CLI, and the operator, whose entry loads it through its own `children`. A suite that
declares the package for its `k8s` run does _not_ thereby put the realm in the processes it deploys;
a process that wants the read API asks with `framework.realms: {kustomize: true}` (T-254).

## What it generates

The tree is written in two halves. `base/` is committed and holds nothing a deploy owns, so it
changes only when the _design_ does; `local/` sits beside it, is ignored, and carries what one
deploy and one cluster say — the artifact's identity and one fill Job per node. `kubectl apply -k`
is pointed at `local/`, which composes the two (D-475).

The split is decided by one question, asked of each object's **name**: does it name the artifact —
one fill Job per node, one attempt per artifact, one claim per artifact? Then the base carries a
_template_ (a folder under `base/templates/`, not listed by the base's kustomization) and the
overlay one small kustomization per instance, which includes the template, appends the identity and
patches back the values the template replaced with `PLACEHOLDER`. No patch can rename an object,
which is why those cannot live in the base as objects. Everything else is in the base: as it is, or
with a patch when the object carries a value the deploy owns — a Deployment's volume, the suite's
declaration.

```text
system/kustomize/
├── base/                     # committed: the same files for every deploy
│   ├── kustomization.yaml    # the labels, and the files below — never the templates
│   ├── namespaces/           # the suite namespace, and the services one when a service is generated
│   ├── deployments/          # one Deployment per process in the plan, with a placeholder volume
│   ├── services/             # one per orchestrator namespace (+ one gateway per portal),
│   │                         #   and one folder per generated service (services/mysql/…)
│   ├── external-services/    # ExternalName aliases, declared and generated
│   ├── ingresses/            # one per host: the portals and the contributed webhooks
│   ├── rbac/                 # the suite's ServiceAccount and least-privilege Role, the UI's
│   │                         # auth-review pair, and the bindings the operator gets here
│   ├── blongdeployment.yaml  # the CR that asks the cluster's operator for this suite, without a digest
│   ├── storage/              # opt-in: the remote manifest for an RWX provider
│   └── templates/            # one folder per kind the deploy owns by name: the fill Job (script and
│                             #   all, since it reads its settings from the environment), an attempt,
│                             #   a claim — the shape, with PLACEHOLDER where the deploy's values go
└── local/                    # ignored: what this deploy and this cluster own
    ├── kustomization.yaml    # resources: [../base, …instances] and the patches below
    ├── cache/<job>/          # one kustomization per node: the fill template + its node and identity
    ├── deployer/<attempt>/   # one per attempt: the seed or migration template + its volume
    ├── volumes/<claim>/      # one per claim, when the backend is `shared`
    └── patches/              # one per object that carries a value rather than a name
```

Every document names the namespace it belongs in, and each root kustomization names one only while
the tree holds a single namespace: the `namespace` field is a rewrite — it moves every namespaceable
object and renames every `Namespace` — so a second one cannot coexist with it (F-440).

The operator itself is _not_ in this tree. It is one process for the whole cluster — its Deployment,
its cluster-scoped rights and the CRD in `system/operator/` beside this realm, generated from
`operator-entry.ts` and applied once, before any suite. What a suite's tree carries is the bindings
that operator is granted inside this suite's namespace, and its own CR.

The output is deterministic — deep-sorted keys, no line folding, the tree is replaced rather than
merged — so a regenerated `base/` is byte-identical across runs, which is what makes it reviewable
in git. The operator reads trees back rather than applying them with kustomize, so it asks for the
flat layout (`kustomize.deploy.layout=flat`, the default) and gets the composed objects in one
directory.

## How the plan is derived

`plan.ts` is pure and framework-free. It reads `registry.describe()` (realms, ports, groups,
folders) and each component's merged config, and returns an `IDeploymentPlan`:

- **Deployments** come from the profile: `namespace` (one per orchestrator namespace), `realm` (one
  per realm, the default), `group` (the explicit `groups` map) or `monolith` (one). A profile the
  planner does not know is refused rather than deployed as `monolith`.
- **Services** come from _dispatch_ orchestrators only. An adapter's namespace (`cluster`, `db`) is
  a local handler group, not something another process dials.
- **Contributions** come from each component's `activation.k8s` block (`k8sReplicas`,
  `k8sResources`, `k8sPorts`, `k8sIngresses`, `k8sEnv`, `k8sManifests`). Objects deep-merge across
  the realms that share a deployment.

## Portals

A portal is a published entry point: an address, and the process behind it. A suite may publish more
than one, because a portal is an address rather than a property of the suite — two hostnames that
answer different things are two entries, and each is served by the process that owns the page it
shows. They are written as a **map keyed by alias**, so a suite config, a CR and an overlay can each
add one without knowing the others' position in a list.

- The **alias** — the key — is the portal's name, and it is what its Service is called
  (`<alias>-http`). It is a name a person chose, so it survives a profile change, which a deployment
  name does not.
- `host` is the DNS name; `path` is the prefix it answers on (default `/`), and `auth` is how the
  ingress controller protects it.
- `realm` names the process that serves it. It is the realm rather than the deployment because a
  deployment is named after the profile and would stop meaning the same thing the moment the split
  changed. A portal that names no realm is allowed only when the suite has exactly one process; with
  several, or for a `companion` that owns no process at all, it is refused rather than guessed.
- One Service per portal, and one Ingress per _host_ carrying every path that host serves — the
  portals plus whatever a realm contributed. Two entries claiming one path on one host are refused,
  because the controller would pick whichever it read first.

The annotations are the controller's, so they belong to the host: two portals on one host share
them, and a realm's webhook may not share a portal's host — it would inherit that authentication, so
the tree refuses it and names both paths.

A portal usually belongs to the **tenant** rather than to the suite: the host is a DNS record and a
TLS certificate, and the auth is enforced by the ingress controller the cluster runs. A suite
declares that it has a portal and the tenant names the host in the CR.

```ts
// in a suite's config: the suite declares the portal and the process behind it
portal: {web: {realm: 'core'}},
// in the CR the tenant applies: the same alias, now with the address it answers on
portal: {web: {realm: 'core', host: 'shop.example.test', auth: {type: 'basic'}}},
```

## The suite volume

Each deployed _artifact_ gets its own named volume, and old ones are kept for a rollback — which is
the artifact rather than the version, because a rebuilt artifact can ship different files under an
unchanged version. The name is the version plus eight characters taken from the artifact: its
`digest` when the publisher computed one, a `deployedAt` stamp otherwise, and the version alone when
an artifact names neither (D-469).

- `nodeLocal` (the default) — one **fill Job per node** unpacks the artifact into
  `/var/lib/blong/suites/<suite>/<identity>`, and a deployment mounts it read-only at
  `/opt/deploy/suite`. No storage class needed. The Job stages the artifact beside the directory it
  will occupy, unpacks it, links it and **makes those links relative** there, then moves it into
  place in one rename: the artifact ends up readable from wherever it is mounted, and a reader sees
  either nothing or a whole tree. That is why nothing has to watch for an artifact being rewritten,
  and why a `path` artifact is stamped rather than hashed.
- `shared` — one `ReadWriteMany` PVC per identity; the seed Job mounts it read-write, deployments
  mount it read-only. Needs an RWX storage class, which `rwxProvider: openebs` can install
  (`rwxManifest` points at the operator).

Either way the artifact is fetched by the deployer, never by the application. Two retentions are
carried as labels, and they are two numbers because they are two quantities: the **volume**
retention (`blong.feasible.one/retention`, default 3) is how many directories stay on each node —
the fill Job reads it and keeps the newest, by modification time — and the **attempt** retention
(`blong.feasible.one/attempt-retention`, default 5) is how many seed and migration Jobs stay, which
the operator's pass reads off the objects it is deciding about (D-471).

## Resolving names in the cluster

Set `resolution.impl: kubernetes` in the suite. `ResolutionK8s` then resolves `rpc-<namespace>` to
`<namespace>.<namespace>.svc.cluster.local`, which is why the generated Service is named after the
namespace. Third-party services stay abstract: the suite names `db`, the cluster decides what `db`
is.

## Configuration

The realm's settings live under two levels: the realm (`kustomize`, which is what the framework
looks up to load the realm at all) and the orchestrator that owns the plan, `deploy`. Each component
is handed only its own slice of the runtime config, so every key below is addressed in two levels —
`kustomize.deploy.<key>`, as `--kustomize.deploy.profile=realm` on the command line or a config
block that nests the same two levels. A key one level too shallow (`--kustomize.profile`) is dropped
without a warning (F-370).

They belong in the suite's `default` block rather than under `k8s`: the generator and the operator
process both read them, and a setting that appears only under `k8s` makes an operator pass report
objects it does not manage as drift (D-379).

```ts
// the suite's config block
kustomize: {
    deploy: {
        suite: {name: 'shop', version: '1.2.0', minFrameworkVersion: '1.38.1'},
        profile: 'realm',
        externalServices: {db: {externalName: 'mysql.backends.svc.cluster.local'}},
        services: {mysql: {storage: {size: '2Gi'}}},
        servicesNamespace: 'blong-services',
        suiteVolume: {backend: 'auto', retention: 3, attemptRetention: 5},
        portal: {web: {host: 'ui.example.test', realm: 'core', auth: {type: 'basic'}}},
        crd: true,
        outputDir: 'system/kustomize',
    },
}
```

### Third-party services

A deployment brings the services its adapters need: a `knex` port brings a MySQL, an `s3` port a
MinIO, and so on. The catalogue under `services/` pairs each descriptor with the adapter kinds that
imply it, and the plan carries every implied service into the tree — its own namespace, workload,
claim, init script, credentials Secret and an `ExternalName` alias in the suite's namespace, so a
realm's config keeps naming `mysql` rather than a host.

The credentials are written twice when this realm generates them: beside the workload, where the
service reads them, and in the suite's namespace, where the deployment that dials the alias reads
them — a pod sees only its own namespace, so a name that answers is not enough (D-462). The values
are derived from the plan rather than random, so the two copies say the same thing on every pass and
nothing has to sync them. A Secret the deployment names under `credentials.secret` is not copied:
its placement is the deployment's own.

`services` is the switchboard, keyed by service name:

- `false` — leave that service to an installation of the deployment's own. Nothing of it is
  generated, so a name a realm's config still dials has to be declared under `externalServices`.
- `true` — generated even though no adapter implied it, which is refused when no activated kind
  does: a workload nothing dials and an alias no configuration resolves.
- an object — generated, with `image`, `storage.size`, `credentials.secret`, `databases`,
  `placement` or `init.script` overridden. `databases` is what the service has to create, and it is
  worth naming whenever the connection that dials it lives in an intent block a planning run does
  not merge — a suite names its database in `release`, a `k8s` run reads it nowhere, and the
  generated service would then create none. `init.script` is the text of the step a service needs
  before it can be dialled, written verbatim: a service whose descriptor carries `initJob: true`
  (Keycloak) gets a Job beside its Deployment that mounts the script and runs it, named for a digest
  of that script because a Job's spec cannot be changed — while a service without one mounts its
  init ConfigMap itself, the way MySQL reads its database list. `placement` is where the workload
  may run — `nodeSelector`, `tolerations` and `affinity`, in Kubernetes' own shapes, passed through
  rather than interpreted — and it is the only way to say so, because a rendered base cannot carry a
  value the plan decides. The storage class comes from `storageClassName`, and `servicesNamespace`
  (default `blong-services`) is where the generated workloads run.

The switches travel in the `BlongDeployment` the tree applies, because the operator regenerates the
tree from that declaration: a switch it could not carry would write the service back on its next
pass. What a pass removes is what its declaration stopped naming _inside the suite's namespace_
(D-461), which is why the `ExternalName` alias — the name a realm's config dials — and the copy of
the credentials written for it are deleted when a service is switched off, while a workload the
service was given a namespace of its own keeps running and is reported as `obsolete` in the CR's
status. Deleting that one is its owner's call, which is the point of the namespace it was given. A
generated workload chooses no node of its own: its base carries no `nodeSelector`, affinity or
topology spread, so it is scheduled wherever the cluster likes, which is the right default where a
storage class is portable between nodes and the wrong one where it is not — a claim binds on one
node, and a pod that lands on another finds no volume. A cluster whose storage is node-local
therefore names its nodes under `placement`, per service. The switches are also on the command line,
per service:

```bash
--kustomize.deploy.services.mysql=false
--kustomize.deploy.servicesNamespace=shop-services
```

## Serving more than one suite

One operator can reconcile several `BlongDeployment`s, and each one needs its tenant's permission
first: the generated `Role` and `RoleBinding` cover the namespace the suite was installed into, so a
second namespace copies those two objects, changes the metadata namespace, and names the
**installer's** ServiceAccount as the subject (`<suite>-operator` in the installer's namespace,
never a second copy of it). The generated `ClusterRole` already lists `blongdeployments` and
`blongdeployments/status`, so a tenant adds no cluster-scoped object of its own. The rules are one
decision with the kinds the realm applies (`OPERATOR_NAMESPACED_RULES` in `operator.ts`), and a kind
added to one without the other fails at apply time with a 403 rather than at review.

## Try it: the end-to-end cycle

`test/blong-int-kustomize` installs the operator, applies a suite into a tenant namespace and
asserts what the cluster ended up with. It runs the whole cycle — generate, apply, wait, check — so
a change to the realm is verified by the same thing a release does, not by a local file. The runbook
is a _blong CLI_ there (`bin/blongIntKustomize.ts`, on the `cli` intent), so its steps are handlers
a release job can call through the framework as well as commands a person types, and the machinery
they share is in that package's `lib/`, in the handler shape.

What it needs, before the first run:

- **A cluster with one agent node.** Domains and cache pods are per node, so a single-node cluster
  hides half of the scheduling story: `k3d cluster create dev-cluster --agents 1` matches `CLUSTER`.
- **The framework image on every node.** A k3d node cannot pull from the host, so the image has to
  be built
  (`podman build -f core/blong-gogo/docker/blong-gogo.Dockerfile -t localhost/blong-gogo:1 .`),
  tagged with the reference the tree names
  (`podman tag localhost/blong-gogo:1 docker.io/library/blong-gogo:1`), saved and imported per node
  with `ctr -n k8s.io images import`. `FRAMEWORK_IMAGE` and `FRAMEWORK_VERSION` name the same pair
  when the tree is generated.
- **A file server inside the cluster.** The fill Job `curl`s the artifact from a pod, so an artifact
  has to be reachable by Service name: an nginx Deployment in `default` exposed as `blong-artifact`,
  with the suite's zip and the operator's zip copied into its web root.
- **A database, for anything that logs in.** The suite's `externalServices.db` is an ExternalName
  Service, so a MySQL reachable as `mysql.blong-integration.svc.cluster.local` is what makes the
  portal's login work rather than answer with a connection error.

Then one command:

```bash
node --conditions=development test/blong-int-kustomize/bin/blongIntKustomize.ts cycle run --cluster=dev-cluster
```

It creates the cluster if it is missing, builds the suite's browser bundle, builds and imports the
framework image into every node, deploys and zips both artifacts into the file server, and runs the
cycle below with `REFRESH=1` so the cluster runs what was just published rather than what it fetched
earlier. It asks before each step that changes the machine, and each one can be skipped
(`BUILD_SUITE=0`, `BUILD_IMAGE=0`, `PUBLISH_ARTIFACTS=0`, `ASSUME_YES=1`). The steps it performs are
the ones a developer would otherwise run by hand, and it performs them in the order that matters:
the bundle before the deploy, the image before the pods restart, the artifacts before the refresh.

The CI-facing command is `test/blong-int-kustomize/bin/blongIntKustomize.ts suite deploy`, and it
takes the same cycle with its inputs from the caller: `ARTIFACT_URL`/`OPERATOR_ARTIFACT_URL` (or
`ARTIFACT_PATH` for an unpacked tree), `FRAMEWORK_IMAGE`/`FRAMEWORK_VERSION`, `CLUSTER`,
`NAMESPACE`, `SUITE_ENTRY`, `TREE`. It never creates a cluster it did not find — a run that was
pointed at one that is not there stops and says so, which is what keeps a forgotten `CLUSTER` from
becoming a second cluster beside the running one (F-446); the job that does want one says
`CREATE_CLUSTER=1`. It regenerates both trees from the repository, applies them — which is what
makes it work on an empty cluster and on one that is already running a revision — and then, unless
`REFRESH=0`, restarts the operator and the tenant processes so the new code is the code that runs.
Two artifacts and the image are published separately, and all three have to be what the repository
says they are — the image carries the framework (`core/blong-gogo`), the artifacts carry the realm
and the suite, and a pod runs the realm through the artifact it fetched, not through the working
copy. Republishing is the case the _digest_ exists for: the run hashes each zip it publishes and
passes it as the artifact's identity, so a rebuilt artifact under an unchanged version is a new
directory and a new fill Job — the tree's apply is what fetches it — while a run that published
nothing falls back to the version and reuses what the cluster has. The operator's cache is keyed by
the same identity, so a republished artifact is fetched there as well rather than planned from the
one it saw before (F-452):

```bash
kubectl -n blong-system rollout restart deployment/blong-operator
kubectl -n <suite namespace> rollout restart deployment
```

What the script asserts: the operator's install tree is regenerated from the repository and applied,
the suite tree is applied, every Deployment reaches Available, the migration Job — the `upgrade`
step a release runs — is `Complete`, every Ingress is read back from the cluster together with the
backend it points at, and no released container printed a `semlog://` reference. A cluster without
an ingress controller is supported on purpose: the Ingress object is asserted through the API and
the page through the Service, which is one port-forward and one request. The login round trip is
opt-in (`BLONG_TEST_USER`/`BLONG_TEST_PASSWORD`), because a deployment seeds no credential a test
may know.

Tear down with `k3d cluster delete dev-cluster`; the script never deletes anything itself.

## What it deliberately is not

No user table, no login realm, no database. A portal's auth is the cluster's — ingress-controller
annotations for basic auth or an oauth2 proxy — and the operator's RBAC is read-mostly. A realm that
needed a database to deploy a database-less framework would be the wrong shape.
