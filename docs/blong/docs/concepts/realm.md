# Realm

To achieve a modular approach, the business logic is separated into different realms. This enables
the code to be focused on the realm's functionality and be developed more independently. The word
`realm` is chosen to avoid ambiguity associated with other words like `module`, `domain`, `class`,
while it can still be associated with the particular meaning these words represent in the following
contexts:

- `module` - the modular development approach, but realms are not the same thing as JS/ES module or
  package.
- `domain` - the domain where the focus is, not the domain name from DNS.
- `class` - realm follows the encapsulation and other OOP principles, but is not implementing JS
  classes.

Realms allow development teams to focus their expertise on the details related to the relevant part
of the business process and implement it end to end (i.e. full stack), including test and
documentation.

A realm is scaffolded rather than hand-built: from the CLI with `blong realm <name>`, or through the
API with `kukum.realm.add`. See the [realm pattern](../patterns/realm.md) for the folder layout and
the [kukum pattern](../patterns/kukum.md) for the programmatic entry points. A realm that needs
entities with relationships contributes its own tables to [the resource graph](resource-graph.md).

## Library realms

Most realms are business domains: a unit of work that a deployment is free to run as its own
service. A **library realm** is the opposite contract — it is carried by every process that calls
it, and its schema is created in every database those processes write to. `blong-core` (the resource
graph) and `blong-access` (RBAC) are library realms; `blong-party` is not, because its data is
business data that must not be copied per database.

The consequence is that a resource id is meaningful only inside the database that minted it, and
that a call into a library realm does not leave the process. That is what lets a realm reach the
graph's helpers by prototype-chain delegation (`super.<method>`, with the library realm listed as an
early child) and hand over the transaction it is already in, instead of importing the package or
resolving the call through the dispatcher.

See the [library realms rationale](../rationale/library-realms.md) for why, and the
[handler pattern](../patterns/handler.md) for the call shape.
