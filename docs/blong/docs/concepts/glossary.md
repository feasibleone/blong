# Glossary

Short definitions of the vocabulary this repository uses with a meaning of its own. Each entry names
one term, defines it in a sentence, and links to the page that explains it — the glossary is a map,
not the territory. The entries are kept in order and checked with `blong-dev glossary`.

<!-- BEGIN GLOSSARY -->

**adapter** — A component that exposes an external system as a high-level handler API and hides the
protocol it speaks. See [adapter](./adapter.md) and the [adapter pattern](../patterns/adapter.md).

**API definition** — The TypeBox schema or OpenAPI spec a handler derives its contract from, and the
source of truth for validation and docs. See [API](./api.md) and [OpenAPI](./openapi.md).

**chain** — The ordered list of steps a test handler returns, executed in whatever order their data
allows. See [chain](./chain.md).

**checkpoint** — A progress point a handler reports to explain the shape a run took, drawn as a note
on the semantic-log diagram. See [checkpoint](./checkpoint.md).

**codec** — A handler group an adapter lists in its imports to serialize the messages of a protocol
and match its responses. See [codec](../patterns/codec.md).

**deployment granularity** — How many processes a suite becomes when it is deployed, chosen by a
kustomize profile rather than by the code. See [kustomize](./kustomize.md), the
[pattern](../patterns/kustomize.md) and the [rationale](../rationale/kustomize.md).

**expected errors** — Errors a test declares up front, matched by `$meta.expect` instead of failing
the run. See [expected errors](./expected-errors.md).

**gateway** — The public JSON-RPC and REST surface of a suite, which validates and documents the API
and carries little business logic. See [gateway](./gateway.md).

**handler** — A single function in a single file, named as a `subjectObjectPredicate` triple. See
[naming](./naming.md) and the [handler pattern](../patterns/handler.md).

**handler group** — The folder of handlers that forms one `realmname.foldername` namespace inside a
layer. See [layer](./layer.md) and the [realm pattern](../patterns/realm.md).

**handler-test continuum** — The model in which handlers and tests share one step execution and
differ only by whether assertions run. See the [rationale](../rationale/unified-handler-test.md) and
[chain](./chain.md).

**injected library function** — A helper a handler group shares through the handler proxy, keyed by
a name that is not a triple. See the [handler pattern](../patterns/handler.md).

**intent** — A positional CLI word that selects the configuration blocks, layers and lifetime of a
run. See [intents](./intents.md) and the [rationale](../rationale/intents.md).

**kukum** — The API that scaffolds and introspects realms, suites, layers, handlers and models. See
[kukum](./kukum.md) and the [kukum pattern](../patterns/kukum.md).

**kustomize** — The realm that turns the registry of a loaded suite into a kustomize tree and a
`BlongDeployment`. See [kustomize](./kustomize.md).

**layer** — A named group of handlers inside a realm, such as `adapter`, `orchestrator` or
`gateway`. See [layer](./layer.md) and the [layer pattern](../patterns/layer.md).

**library realm** — A realm every calling process carries its own copy of, such as `blong-core` and
`blong-access`. See the [rationale](../rationale/library-realms.md) and [realm](./realm.md).

**memory file** — A markdown note an agent keeps for frictions, todos and decisions, written through
`blong-dev memory`. See [memory files](./memory.md).

**model system** — The browser mechanism that generates Browse, New, Open and Report pages from an
`IModelSpec`. See the [model system](./blong-model.md) and
[schema based UI](../patterns/blong-model.md).

**orchestrator** — The component that coordinates adapters and defines an API namespace, and the
place business logic lives. See [orchestrator](./orchestrator.md) and the
[pattern](../patterns/orchestrator.md).

**RBAC** — Role-based access control — roles, capabilities and actions — evaluated over the resource
graph. See [RBAC](./rbac.md) and the [RBAC pattern](../patterns/rbac.md).

**realm** — A business domain boundary that groups layers and can be deployed on its own. See
[realm](./realm.md) and the [realm pattern](../patterns/realm.md).

**resource graph** — The generic subject-predicate-object triples behind `blong-core`, used to
relate and query entities. See [the resource graph](./resource-graph.md).

**schema sync** — The declarative database management that reconciles tables, constraints and
procedures from TypeScript and YAML. See [schema sync](./schema-sync.md).

**semantic log** — Logging that mints an id per record, so the full detail is reached on demand
instead of grepped. See [semantic log](./semantic-log.md).

**session** — A long-lived authenticated connection, with refresh tokens and audit. See
[sessions](./sessions.md).

**suite** — The top-level unit that groups realms and defines the deployment. See
[suite](./suite.md) and the [suite pattern](../patterns/suite.md).

**thenable proxy** — A proxy whose property read records a dependency and returns a promise for the
result of that step. See [chain](./chain.md).

**third-party service** — A service a suite's adapter implies and its deployment brings — a
database, a broker — declared by a descriptor under `services/` and dialled by an abstract name
through an `ExternalName` alias; the resolved form is a `backingService`. See
[kustomize](./kustomize.md).

**upgrade** — The intent that brings a deployed database up to date: it activates the schema sync
and production seeds an adapter declares for it — `schema.sync` and `schema.seed` in the
`blong-server` `db` adapter — and exits when done. See [intents](./intents.md).

**validation** — Schema checks the framework derives from the exported `Handler` type of a handler
and runs at the boundary. See the [validation pattern](../patterns/validation.md).

**watch** — Hot reload of handlers, codecs, stored procedures and config without dropping
connections. See [watch](./watch.md).

<!-- END GLOSSARY -->
