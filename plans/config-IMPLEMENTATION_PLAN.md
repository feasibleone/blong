# Configuration Hot Reload — Implementation Plan

## Overview

### Problem

Configuration loading and merging in Blong is currently spread across multiple
places (`blong-config`, `blong-gogo/load.ts`, `Watch.ts`). Config file changes
today cause a full process restart because there is no mechanism to diff the
new configuration, determine which ports are affected, and invoke adapter-level
reconfiguration. Additionally, handler code can accidentally cache leaf config
values at startup, silently bypassing hot reload.

### Success Criteria

1. A single authoritative `ConfigRuntime` owns the full config lifecycle
   (load → merge → expose → diff → notify).
2. Config is exposed through a stable proxy object; handler and adapter code
   that follows the leaf-access rule automatically sees updated values.
3. When a config file changes, affected adapter ports react selectively
   (e.g., reconnect DB) without restarting the whole process.
4. Adapters without a `configChanged` hook fall back gracefully to a full
   port stop/start.
5. A PoC suite (`core/config-hot-reload`) demonstrates and validates the
   concept end-to-end with automated integration tests.
6. Existing test suites continue to pass — no breaking changes to the public API.

### Who Uses This

- **Framework maintainers** — cleaner, testable config pipeline.
- **Service developers** — live config updates without restarts.
- **Adapter authors** — standard lifecycle hook for config changes.

## Current State Analysis

| Component | Location | Role |
|---|---|---|
| External file/env loading | `core/blong-config/index.ts` | `rc` + `minimist` + merge |
| Activation merge at startup | `core/blong-gogo/src/load.ts` `activeConfigs()` | Merges activation blocks |
| Folder config.ts loading | `core/blong-gogo/src/Watch.ts` `_loadHandlers()` | Per-handler-folder config |
| Config file watch | `Watch.ts` `_watch()` | Touches `watch.log.ts` → restart |
| Port lifecycle | `core/blong-gogo/src/Registry.ts` `createPort()` | start/stop/ready |
| Knex adapter state | `core/blong-gogo/src/adapter/server/knex.ts` | DB pool in `this.config.context` |

The watch handler for config files today does:

```typescript
writeFileSync(join(dirname(import.meta.url.slice(7)), 'watch.log.ts'), '');
```

This is a workaround that triggers a full process restart. The new design
replaces this with an in-process reload pipeline.

## Technical Approach

See the full concept document:
`docs/blong/docs/rationale/config-hot-reload.md`

### Key design decisions

1. **`ConfigRuntime` class** — centralizes load/merge/snapshot/diff/subscribe.
2. **Proxy-based config exposure** — stable object references; adapters and
   handlers never need to be notified to "refresh" their config reference.
3. **`configChanged(diff, next, prev)` adapter hook** — opt-in zero-downtime
   reconfiguration; fallback is full port restart.
4. **Structured log events** — every reload emits a `watch.config.reload`
   event with diff scope and actions taken.
5. **PoC suite** — validates the design before framework-wide rollout.

## Implementation Plan

### Phase 1: Foundation

**Goal**: establish the `ConfigRuntime` abstraction and wire it into the
startup path without changing observable behaviour.

| # | Task | Complexity | Dependency |
|---|---|---|---|
| 1.1 | Document current merge sequence (startup + watch trigger) in code comments | Small | — |
| 1.2 | Design `IConfigRuntime` interface: `load`, `snapshot`, `diff`, `subscribe`, `reload` | Small | 1.1 |
| 1.3 | Implement `ConfigRuntime` class in `core/blong-gogo/src/ConfigRuntime.ts` | Medium | 1.2 |
| 1.4 | Replace ad hoc merge calls in `load.ts` `activeConfigs` + `loadConfig` with `ConfigRuntime.load` | Medium | 1.3 |
| 1.5 | Replace folder `config.ts` merge in `Watch._loadHandlers` with `ConfigRuntime` | Small | 1.4 |
| 1.6 | Add `ConfigRuntime` instance to the `api` object passed through `loadRealm` | Small | 1.5 |
| 1.7 | Run existing test suite; confirm no regressions | Small | 1.6 |

**Acceptance**: All existing tests pass; config merge output is identical to
current behaviour.

### Phase 2: Proxy-Based Config Exposure

**Goal**: expose the effective config as a live proxy object; update backing
data on reload without invalidating references held by adapters.

| # | Task | Complexity | Dependency |
|---|---|---|---|
| 2.1 | Implement `createConfigProxy(snapshot)` utility — wraps nested config in a `Proxy` that reads from a mutable backing store | Medium | 1.3 |
| 2.2 | Update `ConfigRuntime.snapshot` to return the proxy | Small | 2.1 |
| 2.3 | On reload, update backing store in-place (proxy references stay valid) | Small | 2.2 |
| 2.4 | Document the "leaf-access rule" in `docs/blong/docs/concepts/` | Small | 2.3 |
| 2.5 | Run tests; verify proxy is transparent to existing consumers | Small | 2.4 |

**Acceptance**: Handler code reading `config.db.host` inside a handler
function always returns the latest value after a reload.

### Phase 3: Config Reload Pipeline

**Goal**: wire config-file changes into an in-process reload pipeline that
diffs the new snapshot and notifies affected ports.

| # | Task | Complexity | Dependency |
|---|---|---|---|
| 3.1 | Add deep diff utility to `ConfigRuntime`: `diff(prev, next) → ConfigDiff` | Medium | 2.3 |
| 3.2 | Replace the `watch.log.ts` touch workaround in `Watch._watch` with `ConfigRuntime.reload()` | Small | 3.1 |
| 3.3 | After reload, determine which port namespaces are affected by the diff | Small | 3.2 |
| 3.4 | Emit structured `watch.config.reload` log event with diff scope | Small | 3.3 |
| 3.5 | Trigger test re-run after reload (preserve existing watch test behaviour) | Small | 3.4 |
| 3.6 | Run tests; confirm config changes no longer require a process restart | Small | 3.5 |

**Acceptance**: Modifying a config file reloads configuration in-process;
handlers see new values on next call; process does not restart.

### Phase 4: Adapter Config-Change Hook

**Goal**: give adapters a standard lifecycle hook to react to relevant config
changes; provide a safe fallback for adapters without the hook.

| # | Task | Complexity | Dependency |
|---|---|---|---|
| 4.1 | Add `configChanged?(diff, next, prev): Promise<void>` to the adapter port interface in `blong/types` | Small | 3.3 |
| 4.2 | In `Registry.ts`, after computing the port diff: call `configChanged` if present, else stop+start the port | Medium | 4.1 |
| 4.3 | Implement `configChanged` in the Knex adapter: destroy and recreate the connection pool only when `knex` sub-key changed | Medium | 4.2 |
| 4.4 | Implement `configChanged` in the HTTP adapter: recreate TLS options only when `tls` or `url` changed | Small | 4.2 |
| 4.5 | Run tests; confirm no unnecessary port restarts for unrelated config changes | Small | 4.4 |

**Acceptance**: Changing `knex.connection.host` reconnects only the Knex port.
Changing an unrelated key does not restart the Knex port.

### Phase 5: PoC Suite

**Goal**: demonstrate and validate the full concept end-to-end in an isolated
PoC suite with automated integration tests.

| # | Task | Complexity | Dependency |
|---|---|---|---|
| 5.1 | Create `core/config-hot-reload` suite skeleton (package.json, tsconfig.json, server.ts, index.ts) | Small | 4.5 |
| 5.2 | Add a `config` realm with an orchestrator handler that returns a live config value | Small | 5.1 |
| 5.3 | Add a mock adapter with state (simulating DB connection) that implements `configChanged` | Medium | 5.2 |
| 5.4 | Write integration test: mutate config file at runtime, assert handler returns new value | Medium | 5.3 |
| 5.5 | Write integration test: mutate adapter-relevant config, assert `configChanged` was called and state was updated | Medium | 5.4 |
| 5.6 | Write integration test: mutate unrelated config, assert adapter state was NOT recreated | Small | 5.5 |
| 5.7 | Register PoC suite in `rush.json` with `core` tag | Small | 5.6 |

**Acceptance**: All three integration tests pass; PoC can be run with `blong`
from the `core/config-hot-reload` folder.

### Phase 6: Documentation and Rollout

| # | Task | Complexity | Dependency |
|---|---|---|---|
| 6.1 | Update `docs/blong/docs/concepts/watch.md` with config reload behaviour | Small | 5.7 |
| 6.2 | Add "adapter author guide" section to `docs/blong/docs/concepts/adapter.md` covering `configChanged` | Small | 5.7 |
| 6.3 | Update `blong-adapter` skill with `configChanged` hook pattern | Small | 6.2 |
| 6.4 | Compatibility review: run all core test suites; document any migration notes | Small | 6.1 |

## Considerations

### Assumptions

- `chokidar` continues to be the file-watching mechanism; the config reload
  pipeline is inserted inside the existing watch callback.
- Adapter port lifecycle (`start`, `stop`, `ready`) remains unchanged.
- Most existing handlers already read config at call time and require no change.

### Constraints

- No breaking changes to the public suite/realm/adapter API.
- Developer experience must not require mass handler rewrites.
- The proxy must be transparent — existing code that treats `config` as a
  plain object must continue to work.

### Risks

| Risk | Mitigation |
|---|---|
| Hidden leaf-value caching in adapters silently bypasses reload | Document rule clearly; PoC includes a failing test to illustrate the pitfall |
| Incorrect diff scoping causes unnecessary port restarts | Path-based diff with explicit port namespace boundaries; test coverage |
| Race conditions on rapid file changes | Serialized reload queue (reuse existing `PQueue` in `Registry`); debounce |
| Proxy overhead in tight loops | Proxy only wraps config (read infrequently); benchmark before adding caching |

## Not Included

- Static-analysis tooling to detect leaf-value caching (deferred, can be added
  as a lint rule later).
- Live config inspection UI (possible future feature on top of `blong-log`).
- Broad adapter-by-adapter optimisation beyond Knex and HTTP (each adapter can
  add `configChanged` incrementally after the PoC).
- Config schema validation on reload (planned separately as part of TypeBox
  integration improvements).
