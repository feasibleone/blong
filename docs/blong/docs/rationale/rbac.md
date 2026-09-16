# Why RBAC is built on the resource graph

## The problem

Every request needs an authorization verdict, so the naive implementation is a permission lookup per
request: find the caller's roles, expand them into the methods they allow, compare. That puts a
query across roles, capabilities and actions on the hot path of _every_ call — and it forces each
realm to know how another realm names its methods.

## The approach

Blong reuses the resource graph it already has instead of growing an RBAC schema beside it:

- Roles, capabilities and actions are **resources**, and a grant is a **triple** (`hasRole`,
  `hasCapability`, `hasAction`, `belongsTo`) — so RBAC inherits the graph's types, naming and
  hierarchy, and org units can hold roles for their members.
- Reachability is **materialized** into `core.path` (`access.effectiveRole`,
  `access.effectiveAction`) by one stored procedure, turning a decision into a single indexed
  lookup; a recursive traversal never runs while serving a request.
- The caller's roles are encoded as **bits in the signed token**. The gateway verifies the token and
  compares the requested method against the expanded bitmask, so the enormous majority of requests
  never touch the database; the expansion is cached per bit set with a TTL.

## Decisions and trade-offs

**Bits, not names.** A token listing action names would grow with the caller's permissions and would
go stale on a different schedule from the token itself. A 1024-bit mask is at most 172 base64
characters however many permissions the caller holds, and it makes the authorization cache an
expansion per bit instead of a list per request.

**A bit is identity, so it never moves.** The mask in an _already minted_ token is resolved against
the current role-to-bit mapping, so moving a bit would silently hand that token's permissions to a
different role. Role bits are therefore allocated (`MAX(roleBit) + 1`), never reused when a role is
deleted, and an edit that changes one is refused. Three consequences were accepted deliberately: the
1024 ceiling (acceptable because allocation stays dense), gaps after a deletion (harmless), and the
loss of the ability to renumber roles for tidiness.

**Roles are declared by name, not by number.** Picking a free bit by hand was the earlier design,
and its failure mode was silence: the row insert ignored conflicts, so a clash produced a role
resource with no role row — a role nobody could browse or delete, whose name was then taken for
good. The current contract removes the whole class of failure: a blank bit is allocated, an explicit
one is honoured or refused with a typed error, and the store verifies the entity row it claims to
have written.

**One gate, not many.** Enforcement lives in the gateway hook and in the runtime's generic CRUD, not
inside each handler. Handlers that need a decision call the same helpers, so there is one place to
audit and no way for a newly written handler to forget the check.

## What was rejected

- **Action names in the token** — the token grows with the permission set, and every grant change
  needs a re-login or a versioning scheme.
- **A permission query per request** — the latency and the load land on the hottest path there is.
- **Per-realm bit ranges** — they need a registry of realms and ranges (a new coordination point
  between realms that were supposed to be independent) and waste the dense-bit property that keeps
  the mask small.
