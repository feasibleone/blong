# Sessions, Refresh Tokens & Audit

Authentication in Blong issues **access tokens** (short-lived JWTs) that the
gateway verifies **without touching the database** — that is the fast path for
every request. On top of it, Blong maintains **database-backed sessions** that
add revocation, inactivity enforcement, token renewal, and an append-only
audit trail. This document explains the model and the security decisions
behind it.

## Why both tokens and sessions?

| Concern                        | Access token (JWT)                                   | Session (DB row)                                    |
| ------------------------------ | ---------------------------------------------------- | --------------------------------------------------- |
| What it proves                 | "This request is signed by a user"                   | "There is a live, non-revoked login for this user"  |
| Checked on every request       | ✅ yes (signature + expiry, no DB)                   | ❌ no (only on renewal / explicit verify)           |
| Revocable immediately?         | No — lives until `exp`                               | Yes — `access.session.close` / logout              |
| Carries permissions            | ✅ yes (`per` role-bit map + resolved actions)       | No (re-resolved on renewal)                        |

Because access tokens are verified statelessly, **closing a session does not
immediately invalidate already-issued access tokens**. Instead the session's
**renewal is refused**: the access token keeps working until it expires, but it
cannot be refreshed, so the client is effectively logged out within one
access-token lifetime. This is the "closing a session leaves an active token
for up to the refresh interval" behaviour.

## Session lifecycle

A session is created on every successful `login.token.create` **password
grant** and carries:

- `sessionId` — the JWT `ses` claim;
- `tokenHash` — SHA-256 hex of the **current** refresh token (rotated on every
  renewal — this is what makes a stolen, already-used refresh token useless);
- `issuedAt` / `expiresAt` — absolute refresh-token lifetime (fixed);
- `lastActivityAt` — the inactivity anchor (touched on renewal and on explicit
  `access.session.verify`);
- `ipAddress`, `isRevoked`, `revokedAt`, `cookieHash` (restore-cookie handle
  digest, see below).

The `client_credentials` grant is different: it issues long-lived **app**
tokens and creates **no DB session** — no refresh rotation, inactivity
tracking or restore cookie applies to machine credentials.

```text
login ──► session.create ──► access + refresh tokens issued
              │
              ├── renewal (access token near expiry)
              │     ├─► verify session (not revoked / not expired / not inactive) ── touch lastActivityAt
              │     └─► re-resolve permissions ─► new access + rotated refresh token ─► rotate tokenHash
              │
              ├── logout / session.close ──► isRevoked = 1, revokedAt = now, cookie cleared
              │
              └── cleanup (periodic/lazy) ──► DELETE stale/revoked/expired rows
```

### Inactivity timeout & deletion

- **Inactivity timeout** (`login.expire.inactivity`, default 30 min): a session
  whose `lastActivityAt` is older than the timeout is refused renewal and is
  reported `inactive` by `access.session.verify`.
- **Delete interval** (`login.expire.deleteAfter`, default 24 h): stale rows —
  revoked more than the interval ago, inactive for longer than the interval, or
  past `expiresAt` — are purged by `access.session.cleanup`.

Cleanup is a plain knex handler (dialect-neutral — cut-offs are computed in JS,
no stored procedures or SQL date functions). Call it periodically or lazily
from the login / refresh / restore flows.

### Closing a session

`access.session.close` (the logout/revoke primitive) closes the caller's
**own** session with just a valid token — when no id is passed it defaults to
the JWT `ses` claim (`$meta.auth.sessionId`), so an empty call logs the
current session out. Closing any **other** session (an arbitrary id) requires
the `access.session.close` action; otherwise the operation is refused with
`access.session.closeForbidden` (403). Revocation clears the restore cookie.

## Token renewal

`login.token.refresh` redeems the CBC-encrypted refresh token:

1. decrypt + check the refresh token's own expiry;
2. `access.session.verify` — the DB session must be live (not revoked /
   expired / inactive) **and the user still eligible** (active + `accessLogin`
   action — a deactivated user or one who lost the login capability cannot
   renew), and **`lastActivityAt` is touched** (renewing updates the
   inactivity);
3. the **refresh-token hash is checked against the session** — a mismatch means
   the token was already rotated (stolen/replayed), so the session is revoked;
4. `access.permission.list` **re-resolves the current permission set** — role /
   capability / action changes take effect on the next renewal without a
   re-login;
5. fresh access token + **rotated refresh token**, and the session's
   `tokenHash` is updated.

The front-end (via the MLE codec — a non-UI, SDK-usable component) refreshes
automatically a few seconds before expiry. An unexpected 401 is surfaced
**as-is** — there is no forced retry, because the pre-send renewal already ran,
so a 401 means the session is genuinely unusable (e.g. revoked server-side).
If renewal is refused the tokens are dropped and the caller receives a 401,
which the UI turns into a login popup.

## Standard method for critical operations

Normal operations rely on the stateless JWT fast path. Operations that need a
stronger guarantee — e.g. DB writes, sensitive transfers — should **verify the
session** at the start of the handler. `access.session.verify` **throws** an
auth-classified (401) `access.session.*` error when the session is not live,
so the guard is a single line:

```typescript
const {userId} = await handler.accessSessionVerify({}, $meta); // throws on invalid
```

`access.session.verify` (session id defaults to `$meta.auth.sessionId`, the
JWT `ses` claim) checks: exists → not revoked → not past `expiresAt` → not
inactive → user active → holds the `accessLogin` action. It throws
`access.session.notFound` / `access.session.revoked` / `access.session.expired`
/ `access.session.inactive` / `access.session.userInactive` /
`access.session.loginNotAllowed`; the failing reason is on
`error.params.reason`. Pass `touch: true` to also reset the inactivity timer.

## Login eligibility (who may hold a session)

A user may establish or renew a session only while they are still **allowed to
log in**. Two gates are enforced at the session-lifecycle operations —
`login.token.create`, `login.token.refresh` and `login.token.restore` (the
points that mint or extend tokens):

| Gate       | Mechanism                                        | Admin action to disable a login |
| ---------- | ------------------------------------------------ | ------------------------------- |
| Per-user   | `user.isActive` must be `true`                   | set `user.isActive = false`     |
| Per-role   | effective actions must include the `accessLogin` action (always on) | remove the `accessLogin` capability/action from the role |

Both are enforced at **create** (login) and, critically, at **refresh/restore**:
renewal is the operation that would otherwise keep a disabled user's session
alive, so refusing it makes the disable effective within one access-token
lifetime. Failed gates throw `login.userInactive` / `login.loginNotAllowed`
(401) and are recorded in the audit.

The per-role gate reuses the normal RBAC graph — seed the `accessLogin` action
and a capability for it, then grant that capability to the roles that may log in:

```yaml
# meta/dbTest/accessAuthorizationMerge.yaml (test) or meta/db/*Merge.yaml (prod)
role:
  Admin: …,loginCapability
capability:
  loginCapability: accessLogin
```

The gate is **always on** — every role that may log in must grant `accessLogin`
(add the `loginCapability` capability to the role). `access.session.verify`
(the critical-operation gate) checks session liveness **and** login eligibility
— a deactivated user (`access.session.userInactive`) or one who lost the
`accessLogin` action (`access.session.loginNotAllowed`) is refused at the
critical operation itself, not only at the next renewal.

## blong-login works without blong-access (configurable methods)

`blong-login` does not hard-depend on blong-access: every access method it
calls is configurable via `login.methods.*` (a wire name) and **defaults to the
blong-access handler**. A lightweight suite without blong-access can override a
method with its own handler, or set one to `false` to disable that
functionality — e.g. `sessionCreate`/`sessionVerify`/… = `false` for stateless
tokens, `auditRecord = false` to skip auditing, `permissionList = false` to
issue tokens without RBAC permissions. A flow that needs a method which is
disabled fails with a clear `login.configurationError`.

## Audit

Every **access-control decision** is recorded **along with the access check**
at the gateway — this is the single choke point that every operation controlled
through RBAC passes. When `gateway.audit` is configured (e.g.
`{handler: 'access.audit.record', exclude: [...]}`), each request's
allow/deny is appended to `access_audit` with the actor, session, method,
outcome, HTTP status and IP. Access-table DML (`access.user.add`,
`access.role.edit`, …) additionally carries a **sanitised** detail (entity +
id/name keys only — never credentials or hashes). Login success/failure is
recorded by the login flow itself.

Audit is **best-effort and non-blocking** — an audit failure never fails a
request. Operations that record their own audit trail (e.g. payments) or that
must not generate audit noise (integration-test probes) opt out by declaring
`audit: false` on the route, or by listing a methodId pattern in
`gateway.audit.exclude`.

## Restore cookie (skip login on reload)

To avoid re-login on page reload, login sets an **opaque restore cookie**:

- `HttpOnly` — not readable by JavaScript (defends against XSS token theft);
- `Secure` — HTTPS only;
- `SameSite=Lax` — CSRF mitigation;
- **`Path`-scoped to the restore URL only** (`/rpc/login/token/restore`) — the
  cookie is never sent to other endpoints;
- value = a random opaque handle; only its **SHA-256 digest** is stored on the
  session row (`cookieHash`), so a leaked database cannot be replayed as
  cookies;
- TTL from `login.expire.cookie`; **rotated on every use** (one-time semantics).

On reload the UI calls `login.token.restore`, which exchanges the cookie for a
live session (same validity checks as `verify` — **including login
eligibility**: a deactivated user, or one who lost the `accessLogin` action,
cannot resume the session via the cookie), re-resolves permissions and mints
fresh tokens — the login screen is skipped. On logout the cookie is cleared
and the session revoked, so a reload shows the login screen.

> **Why not store the JWT itself in the cookie?** A bearer token in a cookie is
> CSRF-exposed (browsers attach cookies to cross-site requests). An opaque
> handle that only the same-origin restore endpoint can exchange keeps the
> bearer tokens out of the cookie jar entirely. `__Host-` cookies cannot be
> combined with a sub-path scope, so the Path-scoping is the deliberate
> trade-off here.
