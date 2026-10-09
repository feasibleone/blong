# Why kustomize, and why a realm

A suite is a graph: realms, layers, handlers, orchestrator namespaces, adapters. A cluster wants
objects: Deployments, Services, volumes, RBAC. Turning one into the other is unavoidable, and the
interesting question is _where the knowledge lives_.

The legacy framework answered it with a build step and a config file that named which layers went
into which process. That worked, but the mapping was asserted rather than derived: a new adapter
joined the deployment only when someone remembered to add it, and the config could name a layer that
no longer existed without anything complaining.

Blong already knows the answer. The registry holds the realms that loaded, the handler groups that
registered, the orchestrator namespaces that were claimed and the activation config each component
declared. A generator that _reads_ that is describing what is, not what someone believed. That is
the first decision: **the manifest generator introspects the loaded registry rather than parsing
source or trusting a hand-written map**.

That also fixes the granularity question that motivated the framework. A suite that runs as one
process in development and as twelve in production is the same code, and the difference is which
layers land in which deployment. The generator takes that as a profile — `namespace`, `realm` (the
default), `group`, `monolith` — so the architecture is a property of the deployment, not a rewrite.

Three smaller decisions follow from wanting the output to be reviewable.

**The tree is written to disk and committed.** A manifest you cannot diff in a pull request is a
manifest nobody reviews. Generating on the fly at deploy time would be tidier and would hide exactly
the changes worth seeing: a new namespace, a widened RBAC rule, a service that appeared because an
orchestrator was added.

**Only dispatch orchestrators get a Service.** An adapter that declares a namespace — the Kubernetes
adapter's `cluster`, the knex adapter's `db` — is a local handler group. Publishing a Service for it
would put something in the cluster that nothing dials, and it happened: the first pass emitted one,
and the error was only visible by counting services after adding an adapter.

The same reasoning reaches the systems a suite depends on. A deployment that _assumes_ a database —
a config that names a host, and an installation somebody remembered to run — fails on the cluster
that does not have one, and nothing says so until a pod cannot connect. So the adapter kind implies
the service, the catalogue says what that service is, and the deployment brings it: the workload
lands in a namespace of its own, and an `ExternalName` alias in the suite's namespace keeps the
config naming `mysql` rather than a host. Two decisions follow from wanting that to be safe. The
namespace is separate on purpose — a config edit must not be able to take a shared database with it
— and a pass therefore removes only what its declaration stopped naming _inside the suite's own
namespace_: the alias goes when a service is switched off, while the workload is reported and left,
because retiring it is a decision for whoever owns the namespace it runs in (D-461). The cost is
that a switch is finished by two actors — the suite stops generating, an installation stops running
— and the alternative, a reconcile that deletes across namespaces, makes a config edit a destructive
act.

**The artifact is fetched by the deployer, never by the application.** A process that downloads its
own code at startup has to be trusted with the network and has to handle its own version; a process
that finds its code already mounted does not. Each version gets its own volume so a rollback is a
re-apply rather than a re-fetch.

That last decision is where the framework's constraints bite. A `ReadWriteMany` volume shared across
nodes is the obvious shape, and it needs a storage class a bare cluster does not have. Rather than
require one, the default is `nodeLocal`: a per-node cache the deployments mount read-only. It costs
a prefetch pod per node and buys a dependency-free default; the shared volume stays available for
clusters that can offer it. The trade is deliberate — two backends is more code — and the
alternative is an installer that cannot install.

Two things are deliberately _not_ here. The kustomize realm has no database, so it has no user
table: the deployment UI's authentication is the cluster's, expressed as ingress annotations, and
the operator's identity is its ServiceAccount. And the GitOps handoff is a seam rather than an
implementation — a handler that reports it pushed nothing is more useful than one that pretends.

See [kustomize](../concepts/kustomize.md) for what it does and [kustomize](../patterns/kustomize.md)
for how to use it.
