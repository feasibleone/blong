# Expected Errors

## Problem

During automated testing it is common to assert that a given call **should
fail** with a known error type. Consider a test that verifies a parking
handler rejects an invalid zone:

```typescript
await assert.rejects(
    parkingTest({zone: 'red'}, $meta),
    {type: 'parking.invalidZone'},
);
```

When this test runs, the framework has no way to distinguish the thrown
`parking.invalidZone` from a genuinely unexpected failure. Both are logged at
`error` level. In a CI run with dozens of test cases, each expected error
produces a stack trace in the output, making it hard to notice the one real
error buried among the noise.

Three related problems arise:

1. **Log pollution** — expected errors produce `error`-level log entries
   indistinguishable from bugs. Developers learn to ignore error output during
   tests, which defeats the purpose of having error logs.

2. **Missing context for test failures** — when an expected error does occur,
   the framework sometimes swallows useful detail (like additional fields on
   the error object) before returning it to the test assertion.

3. **Microservice transparency** — in microservice mode the test call passes
   through multiple service boundaries. Each boundary independently decides
   whether to log the error at `error` level, regardless of what the
   originating test intended. There is no mechanism for the original caller's
   intent to travel with the request.

## Solution

A first-class `expect` field on `$meta` lets the caller declare which error
types are intentional for a given call. The framework uses this declaration to:

- **Demote expected errors to `debug` level** in `AdapterBase.error()` and in
  the gateway's error handler, preventing them from appearing in the `error`
  stream.
- **Keep error propagation intact** — expected errors still propagate normally
  as thrown exceptions; the caller's `assert.rejects` works as before.
- **Carry the intent across service boundaries** — `$meta` is serialised as
  the last element of the internal RPC `params` array on every
  microservice-to-microservice call, so `expect` reaches every adapter in the
  chain without any additional work.

The feature is guarded by a `gateway.expectedErrors` flag that is `false` by
default. The flag only gates whether the **public API** (external callers)
is allowed to supply an `expect` field. Test handlers that set `$meta.expect`
programmatically are unaffected and work in any environment.

### Why `$meta` and Not a Header

The initial proposal suggested using the HTTP `baggage` header (W3C Trace
Context) for propagation. This was rejected for two reasons:

1. `$meta` is already the authoritative propagation vehicle for all
   request-scoped metadata in Blong. Introducing a parallel channel for a
   single field would add complexity without benefit.

2. For the dominant test use-case — same-process dispatch — there is no HTTP
   layer at all. A header-based approach would require special-casing the
   in-process path.

`$meta.expect` therefore uses the same transport as every other metadata
field: it is part of the `params` array for internal RPC and part of the
JSON-RPC body for the public API.

### Why a Gateway Flag

The `expectedErrors` gateway flag exists for one reason: security. If the
public API accepted the `expect` field unconditionally, a malicious client
could selectively suppress `error`-level audit logs for chosen error types
(e.g., `auth.unauthorized`) without the operator knowing. Setting
`gateway.expectedErrors: true` is therefore a conscious decision that
operators make for development and test environments, and it is excluded from
production configuration by default.

### Why `debug` Level (Not Silent)

An earlier implementation silently skipped all logging for expected errors.
This made it impossible to confirm — during test debugging — that the expected
error path was actually taken. Logging at `debug` level retains the
information for developers running with verbose logging while keeping the
default output clean.

### Wildcard Matching

Supporting a `prefix.*` wildcard alongside exact string matches was chosen
over full regex syntax for two reasons:

1. A wildcard is sufficient for the common cases: "any error from the parking
   namespace" (`parking.*`) or "any auth error" (`auth.*`).
2. Regex strings stored in JSON cannot be distinguished from plain strings
   without a convention. The trailing `.*` convention is unambiguous and
   aligns with glob-style pattern matching familiar to most developers.

## Design

The feature touches three locations in `blong-gogo`:

1. **`AdapterBase.error()`** — when `$meta.expect` matches the error type,
   log at `debug` instead of `error` and continue (do not return early and
   silently drop the log entry).

2. **`Gateway` route handler catch block** — when `$meta.expect` was set by
   the caller and the thrown error type matches, log at `debug` instead of
   `error`. The error is still returned to the client as a JSON-RPC error
   object; only the log level changes.

3. **`Gateway` route handler setup** — `expect` is extracted from the
   JSON-RPC request body only when `this.#config.expectedErrors` is `true`.
   When the flag is `false`, `expect` is always `undefined` and the caller
   cannot influence log levels through the public API.

The `IMeta.expect` field type (`string | string[]`) is already defined in
`@feasibleone/blong/types` and therefore requires no type-level changes.
