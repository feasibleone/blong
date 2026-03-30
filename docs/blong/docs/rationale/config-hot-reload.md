# Configuration Hot Reload

Centralized, hot-reloadable configuration for the Blong framework.

## Overview

Configuration handling in Blong is currently spread across multiple locations:
`blong-config` (external file/env loading), `blong-gogo/load.ts` (activation
merge at startup), and `Watch.ts` (file-change detection). This fragmentation
makes it hard to reason about the full config lifecycle and prevents runtime
configuration changes from propagating cleanly to running components such as
database adapters.

This document describes the design for a unified configuration runtime that:

1. **Centralizes** load/merge logic into a single authoritative pipeline.
2. **Exposes config via a stable proxy**, so handlers always see the latest
   values without requiring a process restart.
3. **Detects configuration changes** and notifies adapters/ports so they can
   react (e.g., reconnect to a database) rather than forcing a full restart.
4. **Preserves developer experience** — no mandatory new syntax in handlers,
   minimal new rules to learn.

## Problem Statement

### Current flow (simplified)

```
blong-config (rc/env/argv)
    ↓
loadRealm — activeConfigs merge (load.ts)
    ↓
Watch._loadHandlers — folder config.ts merge
    ↓
Watch._watch — file-change detected
    ↓
  watch.log.ts touch → full process restart (for config changes)
```

Config changes outside of handler files today result in a process restart
because there is no mechanism to:

- diff the new effective configuration against the old one,
- decide which ports are affected,
- call an adapter-specific reconfiguration routine.

### Proxy-based config access

A core requirement for hot reload is that handlers **never cache leaf config
values at startup**. Because handler functions are re-evaluated on every call,
they naturally avoid caching. However, startup code (adapters, orchestrators)
that destructures config into local constants will miss live updates.

The design uses a JavaScript `Proxy` to expose configuration as a stable
object reference whose backing data is replaced on reload:

```typescript
// ✅ Safe — leaf value read at call time inside the handler
handler(({config}) => async function myHandler() {
    return {host: config.db.host}; // always fresh
});

// ✅ Safe — intermediate object destructured at startup, leaf read later
adapter(({config}) => {
    const {db} = config; // 'db' is a stable proxy node
    return {
        exec() { return connect(db.host, db.port); } // fresh on each call
    };
});

// ❌ Unsafe — leaf value cached at startup, misses hot reload
adapter(({config}) => {
    const host = config.db.host; // primitive cached here
    return {exec() { return connect(host); }};
});
```

The rule: **destructure intermediate config objects freely at startup; read
leaf (primitive) values only at call time**.

## Design

### ConfigRuntime

A new `ConfigRuntime` class owns the full config lifecycle:

| Responsibility | Detail |
|---|---|
| Load | Combine rc files + env vars + argv + module-level defaults |
| Merge | Apply activation-ordered merge (`default` + active activations) |
| Proxy exposure | Return a live proxy object wrapping the merged snapshot |
| Diff | Compute a structural diff between old and new snapshots |
| Subscribe | Allow ports/adapters to register `onChange(diff)` callbacks |
| Reload | Re-run load+merge, compute diff, notify subscribers |

`ConfigRuntime` is instantiated once at suite startup and passed into the
`Watch` instance, replacing the current ad hoc merge calls in `load.ts` and
`Watch._loadHandlers`.

### Proxy contract

The proxy wraps the mutable snapshot object. When config reloads:

1. The snapshot object is mutated in place (or replaced with prototype swap).
2. Existing proxy references held by adapters/handlers continue to resolve
   against the new backing data.
3. No action is required from handler code — it transparently reads the latest
   values.

### Adapter config-change hook

Each adapter can optionally implement a `configChanged` lifecycle hook:

```typescript
configChanged?(diff: ConfigDiff, next: object, prev: object): Promise<void>;
```

When the reload pipeline finishes diffing, it calls `configChanged` on every
port whose configuration namespace was affected. The `diff` argument describes
exactly which keys changed.

**Default behavior** (no hook): if a port's config changed and it has no hook,
the registry falls back to a full port stop/start cycle.

**Example — Knex adapter reconnection:**

```typescript
adapter<IConfig>(({utError}) => ({
    activation: {default: {type: 'knex', knex: {client: 'mysql2', ...}}},
    start() {
        this.config.context = {queryBuilder: Knex(this.config.knex)};
        return super.start();
    },
    async configChanged(diff) {
        if (diff.has('knex')) {
            await this.config.context.queryBuilder?.destroy();
            this.config.context = {queryBuilder: Knex(this.config.knex)};
        }
    },
    async stop(...params) {
        await this.config.context.queryBuilder?.destroy();
        this.config.context = null;
        return super.stop(...params);
    },
}));
```

The hook only reconstructs the connection pool when the `knex` sub-key
changed. Unrelated config changes do not interrupt existing queries.

### Reload pipeline (step by step)

1. **File change detected** (chokidar, existing Watch logic).
2. **Determine change type**: config file vs handler file vs layer file.
3. If a config file changed:
   a. Re-run `ConfigRuntime.reload()`.
   b. Compute diff per port namespace.
   c. For each affected port: call `configChanged` if present; else restart port.
   d. Emit structured log event `watch.config.reload`.
   e. Emit test re-run event (existing behaviour).
4. If a handler/layer file changed: existing hot-reload path, unchanged.

### Structured log events

Every reload emits a log entry with:

```json
{
  "$meta": {"mtid": "event", "method": "watch.config.reload"},
  "changed": ["db.knex.connection.host"],
  "portsAffected": ["myapp.db"],
  "action": "configChanged"
}
```

## Impact on existing code

| Area | Impact |
|---|---|
| `blong-config` | No breaking changes; `ConfigRuntime` wraps it |
| `load.ts` | Merge orchestration delegates to `ConfigRuntime` |
| `Watch.ts` | Config-file branch calls `ConfigRuntime.reload()` instead of touching `watch.log.ts` |
| Adapters (existing) | No change required; fallback is full port restart |
| Adapters (opt-in) | Can implement `configChanged` for zero-downtime reconfiguration |
| Handler code | No change required; leaf reads inside handlers are already call-time |

## Developer rules (summary)

1. **Do** read leaf config values inside handler/operation functions.
2. **Do** destructure intermediate config objects at startup (e.g., `const {db} = config`).
3. **Don't** cache leaf primitives at startup if they should update on hot reload.
4. **Adapters** that hold stateful connections should implement `configChanged`
   to avoid unnecessary downtime.

## PoC suite

A dedicated PoC suite (`dev/config-hot-reload-poc`) demonstrates and validates
the concept end-to-end. See the implementation plan for details.
