# Kustomize

Deploying a suite means turning its graph — realms, layers, orchestrator namespaces — into cluster
objects. `blong-kustomize` does that from the loaded registry: run the `k8s` intent and it writes a
kustomize tree that can be applied as it stands.

Key behaviours:

- **The `k8s` intent is short-lived.** Like `cli` and `db`, the process serves nothing: it
  introspects, writes `system/kustomize/` and exits. A failure exits non-zero, so a broken tree
  fails the build instead of reaching a cluster.
- **The tree is derived, not asserted.** Realms, layers and namespaces come from
  `registry.describe()`. Nothing reads the source, and nothing names a layer by hand.
- **Granularity is a profile.** `namespace`, `realm` (the default), `group` or `monolith` decides
  how many processes the suite becomes; the code is the same either way, and a profile the planner
  does not know is refused rather than quietly treated as `monolith`.
- **Each suite version gets its own volume.** Deployments mount it read-only; a deployer fills it.
  The default backend needs no storage class.
- **A namespace is an address.** Each dispatch orchestrator gets a Service named after its namespace
  — which is what a suite names when it calls another process, and what an `ExternalName` does for a
  third-party system.
- **A deployment brings the services its adapters need.** A `knex` port brings a MySQL, an `s3` port
  a MinIO: the tree carries the workload, its claim, its credentials and an `ExternalName` alias in
  the suite's namespace, so a realm's config keeps naming `mysql`. A suite may switch one off and
  point at an installation of its own.
- **A pass removes what its declaration stopped naming — inside the suite's namespace.** The alias
  goes when a service is switched off, while the workload, in a namespace of its own, is reported
  and left.
- **Components shape their own deployment.** An adapter or orchestrator declares its replicas,
  ports, ingress paths and env in its own layer file.

See [kustomize](../patterns/kustomize.md) for the configuration and
[kustomize](../rationale/kustomize.md) for why it is derived.
