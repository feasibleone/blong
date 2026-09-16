# RBAC (Role-Based Access Control)

Blong answers "may this caller invoke this method?" from a graph of resources — a user holds roles,
a role grants capabilities, a capability groups actions — and each role is one **bit** in the signed
token the caller presents. The gateway therefore authorizes every request from the token alone: no
database round-trip on the hot path, and no realm needs to know another realm's method names.

## Key behaviours

- **Roles are bits.** A role carries a unique `roleBit` (0–1023) that is _allocated_ when the role
  is created and never reused; the JWT's `per` claim is a base64 bitmask of the caller's roles.
- **The graph is materialized.** `access.effectiveRole` and `access.effectiveAction` paths are
  rebuilt by `CALL access_pathRefresh()` after any RBAC change, so a decision is one indexed lookup
  instead of a recursive walk.
- **Units join in.** A user may hold a role directly (`hasRole`) or through a unit (`belongsTo`).
- **The gate is a single hook.** `access.authorization.list` expands the bits into allowed action
  methodIds (TTL-cached) and the gateway compares the requested method against that list — 403 with
  a valid token, 401 without one.
- **Logging in is itself a permission.** The `accessLogin` action must be in the caller's effective
  actions, or the session gate refuses to establish or renew a session.

See the [RBAC pattern](../patterns/rbac.md) for how to seed, grant and verify it, and the
[RBAC rationale](../rationale/rbac.md) for why a role is a bit. The `blong-access` README documents
the tables, handlers and configuration defaults; the [sessions](sessions.md) concept covers the
session gate that reuses this graph.
