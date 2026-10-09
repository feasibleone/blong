---
name: blong-kustomize
description:
    Deploy a Blong suite to Kubernetes. `realm/blong-kustomize` turns a loaded suite into a
    kustomize tree, a versioned suite volume and a `BlongDeployment` the operator reconciles. Use
    this skill whenever the task is to deploy a suite, generate or change Kubernetes manifests, add
    a Service/Ingress/volume for a suite, wire service discovery in a cluster, expose a deployment
    UI, or reason about deployment granularity (which realm or layer runs in which process) — even
    if the user just says "deploy this", "we need a manifest" or "put it on k8s". For writing the
    realm code itself see blong-realm; for the intents this relies on see blong-intent.
---

# Deploying a suite with blong-kustomize

`realm/blong-kustomize` is a **bare-cluster installer**: no business realm and no database of its
own. It reads the loaded registry, writes manifests, and generates the third-party services a
suite's adapters imply — a workload, a claim, credentials and an `ExternalName` alias per service,
so a realm's config keeps naming `mysql` rather than a host (see _The services a deployment brings_
below). The deployer — the `k8s` intent for a tree, the operator for a running suite — is the only
thing that talks to a cluster about them.

## The `k8s` intent

```bash
blong ./suite/blong-suite/index.ts k8s
```

Short-lived, like `cli` and `db`: serve nothing, introspect, write `system/kustomize/`, exit. A
throw exits non-zero, so a broken tree fails the build instead of being committed. The realm writes
only when the `k8s` activation block set `generateManifests` — never guess from the intent name
inside the realm.

The tree is written in one of two layouts, and which one is a config key (`layout`):

- `flat` (the default) is one directory of manifests, and it is what the **operator** asks for: it
  reads a generated tree back and compares its objects with the cluster, so a base with patches is a
  tree it cannot evaluate (D-395).
- `split` writes a committed `base/` beside an ignored `local/`, and is what a **repository** tree
  uses: the base holds nothing a deploy owns, and the overlay holds the artifact's identity and one
  fill Job per node. Apply it with `kubectl apply -k <tree>/local`, never the tree itself (D-475).

    What the deploy owns is decided by each object's **name**: one that names the artifact (a fill
    Job per node, an attempt, a claim) cannot be patched into place — no patch renames an object —
    so the base carries a **template** under `base/templates/<kind>/` with `PLACEHOLDER` where the
    deploy's values go, and the overlay one kustomization per instance that includes it, appends the
    identity through `nameSuffix` and patches the values back. Every other object is in the base as
    it is, or with a patch when it carries a _value_ the deploy owns (a Deployment's volume, the
    declaration's digest). A rule of thumb: the base is what a reviewer should read, and the overlay
    is what changes between two deploys.

## Configuring the realm

A component is handed only its own slice of the runtime config, so the realm's settings are
addressed in two levels, `<realm>.<component>.<key>`: the realm key is what makes the framework load
the realm at all, and the component that owns the plan is named in its file — `deploy`, hence
`--kustomize.deploy.outputDir=/tmp/tree` on the command line or
`config.<intent>.kustomize.deploy.<key>` in a suite. A key addressed one level too shallow
(`--kustomize.outputDir`) is dropped **without a warning**, so a typo looks exactly like a feature
that is not wired (F-370). The same slice reaches the realm's handlers, so a handler reads
`self.config.<key>` too.

Those settings live in the suite's `default` block, never under `k8s`: the generator and the
operator process both read them, and a setting that appears only under `k8s` makes an operator pass
report objects it does not manage as drift (D-379).

### What a realm is in a deployment

`k8sRealmRole` is declared by the realm, never by the suite that deploys it (D-433) and never by a
component: a port cannot state it, because a realm such as `blong-core` or `blong-access` owns no
port of its own — its handlers live in the shared `srv.db` adapter — and a role is a property of the
realm rather than of whoever happens to own a port. The realm says it in its own `server.ts`, in the
block of the intent the answer holds for:

```typescript
export default realm(() => ({
    url: import.meta.url,
    // What this realm is in a deployment, the same in every one of them.
    config: {default: {k8s: {k8sRealmRole: 'both'}}},
}));
```

The loader records each realm's own config under that realm's name, `describe().realmConfig`
publishes it, and `registryView` reads the role from there. The four values are `service` (the
default: a process of its own), `companion` (carried by every process, owning no Service), `both`
and `none`. Write the deployment answer under the realm's `default` block: a block _beside_
`default` is merged only while that intent is active, and the operator runs `release` — while an
answer that holds only for a run of the realm itself (its own entry, its tests, its CLI) belongs in
`dev` or `integration`, which is how `blong-kustomize` is `none` in a suite's tree and `service` in
its own. Two payoffs over a suite-level list — the realm answers for itself, and one realm loaded
under two names (`server` the framework's, `srv` its child's) keeps its answer under either, because
the answer travels with the realm rather than with the name.

The realm's own login is a namespace, not a method: the portal asks for `login.token.create`, this
realm answers it (it does not load the framework's `login` realm), and the browser therefore needs
the namespace registered in the front-end orchestrator — `browser/orchestrator/subject/init.ts`,
whose `namespace` lists every namespace the realm owns. The folder name `subject` stays literal: a
declaration file under a folder named after the namespace does not bind, and the symptom is
`remote.bindingFailed` with no request leaving the browser (F-371).

## The pipeline

`plan.ts` → `generator.ts` → the tree, and every step is pure:

1. `registryView(registry)` reduces `registry.describe()` (realms, ports, groups, folders) plus each
   component's config. The layer of a group is the path segment before its folder.
2. `planFromRegistry(view, options)` returns an `IDeploymentPlan`. **Services come from dispatch
   orchestrators only** — an adapter's namespace is local — while the _third-party_ services a
   deployment brings are resolved from the adapter kinds its ports carry (`knex` implies MySQL, `s3`
   MinIO) and filtered by the suite's own switchboard.
3. `buildKustomizeTree(plan)` returns path → document; `writeKustomizeTree` replaces the directory
   and serialises deterministically (deep sort, no folding). Regenerating an unchanged suite must
   produce no diff.

## The services a deployment brings

A suite that activates an adapter kind gets the service that kind implies: a `knex` port brings a
MySQL, `s3` a MinIO, `kafka` a broker. `services/<name>.yaml` is the catalogue — the descriptor
names the kinds that imply it, its image and port, its storage and the keys its credentials are read
by — so adding a service is adding a file, and a plan that activates no such kind brings nothing.

The deployment may name its own values. `kustomize.deploy.services.<name>` is `false` (it runs that
service itself, and the name has to be declared under `externalServices` instead), an object
(`image`, `storage.size`, `storage.storageClassName`, `credentials.secret`), or `true` — which is
refused unless an activated adapter implies it, because the workload would be one nothing dials.
`servicesNamespace` (default `blong-services`) is where the workloads run; `storageClassName` is
what their claims ask for.

Generating one service means its workload (from `services/<name>/base`, a document the plan renders
by substituting what it decided), its `Service`, a claim when the descriptor declares storage, an
init ConfigMap, a credentials Secret whose values derive from suite, service and version — and an
`ExternalName` alias **in the suite's namespace**, which is the name a realm's config dials.

The request travels in the CR (`spec.services`, `spec.servicesNamespace`, `spec.storageClassName`),
because the operator regenerates the tree from that declaration: a switch it could not carry would
write the service back on the next pass (T-279). What a pass _removes_ is what its declaration
stopped naming inside the suite's namespace (D-461) — so the alias goes with the switch, while the
workload in a namespace of its own is reported `obsolete` and left, which is the point of the
namespace it was given.

## Contributing Kubernetes resources

A component shapes its own deployment from its layer file — there is no separate descriptor to keep
in step (see `[K8S_CONTRIB]` in `_shared/conventions.md`):

```typescript
activation: {
    default: {namespace: 'webhook'},
    k8s: {k8sIngresses: [{name: 'shop-webhook', path: '/webhook/shop'}]},
}
```

Keys: `k8sReplicas`, `k8sResources`, `k8sPorts`, `k8sIngresses`, `k8sEnv`, `k8sManifests`. Objects
deep-merge across the realms sharing a deployment; arrays concatenate. An ingress with no
`serviceName` binds to the owning deployment.

## Portals

A portal is an address and the process behind it, and a suite may publish more than one. They are a
**map keyed by alias**, never a list: a list cannot be merged, so a suite config, a CR and an
overlay could not each add a portal, and the position in the array would be load-bearing.

```typescript
portal: {
    shop: {realm: 'marine', host: 'shop.example.test', auth: {type: 'basic'}},
    admin: {realm: 'access', host: 'admin.example.test', auth: {type: 'oauth2', authUrl: 'https://id'}},
},
```

The **alias is the portal's name** and names its Service (`<alias>-http`), which is why the key is a
name a person chose: `realm` names the process, not the deployment, because a deployment is named
after the profile and would stop meaning the same thing the moment the split changed. `realm` is
omissible only for a suite with a single process; several processes with no realm named, or a
`companion` (carried by every process, owning none), are refused at plan time. The tree emits one
Service per portal and one Ingress per host, carrying that host's portals beside the paths realms
contribute — so a certificate and a DNS record line up with one object. Two entries claiming one
path on one host are refused. The annotations belong to the host rather than the path, so two
portals on one host share them — and a realm's webhook may not share a portal's host, because it
would inherit that authentication: the tree refuses it and names both paths (T-241).

The host is the **tenant's**: it is a DNS record and a certificate, and the ingress controller the
cluster runs is what enforces `auth`. A suite declares that it has a portal and the tenant names the
host in the CR, under the same alias.

## The operator

`operator: {enabled: true}` ships a Deployment running the same suite image with a controller loop.
It reads its plan from the suite's `BlongDeployment` CR rather than from the registry it runs,
applies the difference against the cluster, and reports back:

- **The phase is on the CR**, so `kubectl get bdep` answers the first question: `Failed`, `Ready`,
  or `Progressing` while a Deployment is short of replicas. `lastResult` holds the counts of the
  last pass, so a stale status can be told from a fresh one, and `deployments` holds the
  availability behind the phase.
- **`prune` is on, and scoped to the suite's namespace** (D-461): the generated Deployment sets
  `BLONG_CONTROLLER_PRUNE=true`, so an object the declaration stopped naming is removed — the
  `ExternalName` alias goes when a service is switched off — while anything in a namespace of its
  own is left alone and reported as `obsolete`. Converging and removing are different intentions,
  which is why they are two settings rather than one, and a deployment that wants its processes
  updated without anything ever being deleted keeps `prune` off.
- **The watch is a handler** (`kustomize.watch.run`), not part of the deploy orchestrator's loop,
  because the loop reaches the adapter through another component and a stream does not survive that
  request path — it answers `null`, which reads as "no events and nothing existing" (T-225, T-227,
  and `[REMOTE_BOUNDARY]` in `_shared/conventions.md` is the rule). Through the handler proxy the
  adapter returns the initial list and the generator whole, and the list is what makes a restarted
  operator converge.
- **The rights objects are install-owned too.** The `Role`, `RoleBinding`, `ClusterRole` and
  `ClusterRoleBinding` join the CRD and the ServiceAccount in `INSTALL_OWNED_KINDS`: a reconcile
  that applied them could widen its own rights, and the cluster refuses it anyway (a pass died on
  `clusterroles.rbac.authorization.k8s.io is forbidden`). The managed set is the workloads — ten
  objects for this suite — so a change to those rights needs the install.
- **The CRD belongs to the install.** A reconcile skips it deliberately, so a status field the
  generator learns to write reaches a cluster only with the next `kubectl apply -k` of the
  regenerated tree.

### Getting a change into the cluster

The cycle is scripted — `test/blong-int-kustomize/` (a blong CLI whose commands are handlers, plus
the assertions as tap groups) — and the ordering they encode is the part that is easy to get wrong:
where a change lives decides what has to be republished, and a stale half keeps serving the old
behaviour while the source already reads correctly.

The realm's handlers travel in the **artifact** (the zip the prefetch fetches, so it needs a
`rush deploy` and a new upload), the framework's adapters travel in the **image**, and the volume
keeps serving the tree it has already unpacked until the cache pods are deleted. A pod says which
half it got: the pre-fix loop logs its own request as its result
(`controller: pass … {"$meta":{"mtid":"request"…}}`), which is how a stale artifact was caught after
a local run had already reported the fix.

A portal is a fourth thing, and it is the one that has no error to give: `dist/` is produced by the
suite's own `build` (`vite build`), so a `rush deploy` **after** a `rush build --to <suite>` carries
it while a deploy on its own carries sources and the page silently 404s. `test/blong-int-kustomize`
asserts the portal as far as a cluster without an ingress controller allows — the Ingress exists,
its backend Service owns endpoints, and `/s/` answers with a page through a port-forward — and says
so rather than pretending to have tested the hostname, because serving a `Host` is the controller's
job and a bare k3d cluster has none.

### Rights per tenant

The operator's workload rights are namespaced — a `RoleBinding` can point at nothing else — while
the CR and its status are covered once by the generated `ClusterRole`. A tenant that wants a suite
served in its own namespace copies the operator's `Role` and `RoleBinding`, changes the namespace,
and binds the **installer's** ServiceAccount (`<suite>-operator` in the installer's namespace); it
adds no cluster-scoped object. The rules mirror `OPERATOR_NAMESPACED_RULES` in `operator.ts`: a kind
the realm may apply is a kind the operator may write, and one list without the other fails at apply
time with a 403.

## The suite volume

The artifact is fetched **by the deployer**, never by the application, and each _artifact_ has its
own volume so a rollback is a re-apply, not a re-fetch. The name is the version plus eight
characters of the artifact's identity — its `digest` when the publisher computed one, a `deployedAt`
stamp otherwise, the version alone when it names neither (D-469): a rebuilt artifact under an
unchanged version is a **different** directory, which is the whole reason nothing ever rewrites a
volume a reader is attached to.

- `nodeLocal` (default) — one **fill Job per node** fills `/var/lib/blong/suites/<suite>/<identity>`
  on that node; a deployment mounts it read-only at `/opt/deploy/suite`. No storage class. The Job
  stages the artifact beside the directory it will occupy, unpacks it, links it and **rewrites those
  links as relative ones**, then moves it into place in one rename. The links then name a path
  inside the tree, so the artifact reads from wherever it is mounted, and a reader still sees either
  nothing or a whole tree (D-476). The Job then keeps the newest `retention` directories by
  modification time (D-468, D-470).
- `shared` — one `ReadWriteMany` PVC per identity, seeded by a Job; `rwxProvider: openebs` +
  `rwxManifest` installs an RWX provider.

The plan must carry the **nodes** (`nodes`), because a `nodeLocal` tree is one Job per node: a plan
with none is not written at all, and says so (D-470). A port's `start()` cannot read them — the
handler proxy is not given to an orchestrator factory — so the `k8s` intent asks its own
`kustomize.tree.generate` handler through `request`, exactly as the controller asks for a reconcile
pass.

Two retentions, because they are two quantities: volumes (default 3) are per-node directories the
fill Job prunes, attempts (default 5) are the seed and migration Jobs the operator's pass prunes
(D-471).

## The step before the workloads

The migration Job is a **step, not a process**: the tree emits it ahead of the Deployments, and a
reconcile waits for it, because everything `APPLY_ORDER` puts after it reads what it wrote — a
service that migrated on start would race every other pod doing the same at the same moment. A Job
that failed is **left where it is**, because that is what a failed deploy is read from — its events
and its logs; the name carries the **deploy stamp** (the artifact identity) and a hash of what the
Job runs, so re-applying one artifact is the _same_ attempt — waited on rather than created — while
a changed artifact or a changed container is a different object and nothing has to be deleted for it
to exist (T-218, D-378, D-386, D-471).

## Discovery in the cluster

Set `resolution.impl: kubernetes`. `ResolutionK8s` maps `rpc-<namespace>` to
`<namespace>.<namespace>.svc.cluster.local`, so the generated Service is named after the namespace.
That Service is the _dispatch_ address: a peer calls `<namespace>.request` on the **RPC** port, and
the Service publishes 8091 for it rather than the gateway's 8080 (F-362). Per-method routes such as
`/rpc/kustomize/deployment/find` are a different surface — they are **gateway** routes, answered on
8080 — so a process that serves a UI for them has to declare a `gateway` config; the rpc server
carries the internal dispatch alone, which is what left the operator's read route with no listener
(T-261).

## Rules

- Generate with the API, not by hand: `blong … k8s` writes the tree; never hand-edit
  `system/kustomize/`, because the next run replaces it — `base/` and the ignored `local/` alike.
- Type a new realm layer into a **well-known** folder. A custom top-level folder is never discovered
  — it is only reachable as a child realm (F-361).
- The realm must carry no database of its own and no business realm; it _writes_ the services a
  suite needs rather than depending on them. It enforces the first by not declaring them in
  `package.json`, since the framework auto-loads the framework realms a manifest declares — and a
  realm in that list may name the intents it is meaningful under, which is how this one stays out of
  the processes its own suite deploys (`frameworkRealms`, T-254).
- Verify against a real cluster: `kubectl apply -k <tree>/local --dry-run=server` catches what
  `kubectl kustomize` cannot.
