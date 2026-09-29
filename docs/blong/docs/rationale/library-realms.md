# Why core and access are library realms

## The problem

`blong-core` holds the resource graph: every resource-based entity — a user, a role, a person, a
capability — is a `core_resource` row, and their relationships are `core_triple` edges. A solution
that spans more than one database cannot keep that graph in one of them. If it did, every write in
every other database would have to reach across a network hop to register the resource it just
created, and no write could ever be atomic with it: the entity row and the graph entry would live in
two databases with no transaction spanning them.

The same argument applies to `blong-access`, which answers "may this caller do this?" for services
that may run against their own databases.

## The approach

`blong-core` and `blong-access` are **library realms**. Every process that calls them carries its
own copy of the realm, and the realm's schema is created in every database such a process writes to.
A solution with two databases has two resource graphs, and a `resourceId` is meaningful only inside
the database that minted it — a property callers have to respect, not a detail they may ignore.

Because the realm is in the process, a call into it does not cross a boundary that can fail on its
own: it is a local call on the caller's own connection, and a write can therefore join the caller's
transaction. That is what makes `core.resource.ensure` — find-or-create a resource by type and name
— usable as the first statement of a transaction, rather than a step that has already committed by
the time the transaction opens.

## Reaching a library realm

Not by importing the package, not through a `library()` binding, and not through the handler proxy.
Importing the package would freeze a topology into the source: a realm is a unit a deployment may
run as its own service, and one realm importing another's module contradicts the deployment freedom
the framework exists to provide. A `library()` function cannot cross realms either — the `lib`
object is assembled per handler group, so a function defined in one realm's group is visible to that
group's siblings and to nobody else. And the handler proxy, the IoC mechanism for calls that may be
local or remote and may be mocked, is the wrong tool for a transaction: a knex transaction cannot
travel through it.

What remains is the mechanism the framework already uses for delegation: **`super.<method>`**, plain
prototype-chain delegation to the handler group attached before the caller's. It resolves inside the
process by construction, so it can carry a transaction, and it needs no import and no extra wiring.

It has one requirement: **the providing realm must be attached first**, so a suite lists it as an
early child (`srv`, `login`, `core`, `access`, …). The canonical suites already do; a suite that
lists a resource-based realm before `core` breaks delegation, and nothing will say so until the call
is made.

The caller must also be a handler whose group is attached **after** the provider's, on the **same
port** — which is why the whole `adapter/db` layer of every realm shares the one `srv.db` port, and
why a handler that has to delegate must return an object literal: a plain `function` expression has
no `super` to reference. Two calls therefore stay on the handler proxy: a handler calling a member
of its **own group** (siblings are not on the chain the literal inherits) and a handler in **another
port** — the test layer's handlers sit on their own `testDispatch` port, not on `srv.db`.

## Trade-offs

The call no longer names its target. `super.coreResourceEnsure(...)` does not say which realm
answers it, and the framework cannot check that the right group is attached. The alternative —
declaring the dependency as a handler binding — is checkable but cannot carry a transaction.
Atomicity won, and the ordering requirement is stated where suites are written.

Two things are deliberately not settled here. The first is `blong-access` as a library realm:
supplying access control to a service that runs off its own database is the case that motivates it,
and it is to be tested and refined. The second is `blong-party`, which is not a library realm — it
holds business data (people, organizations, addresses) that must not be copied into every database.
A library realm and a non-library one can still meet in the graph, because a triple names ids rather
than rows, but what that means for a multi-database deployment has not been worked out.
