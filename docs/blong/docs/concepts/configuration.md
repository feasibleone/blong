# Configuration

Blong's configuration is one object, built by merging several sources in a fixed order and handed to
every component that needs it. A later source overrides an earlier one, and the last word belongs to
the command line.

The order, from the weakest to the strongest: the platform defaults (version, platform, method,
intent list), the framework's own defaults, the realm's or suite's `config` blocks in source, the
parameters a loader was called with, the shared rc file (`~/.blong_devrc` or the repository's), the
suite's own rc file, and — applied on every merge — the command line. A deployment supplies what
source code should not: secrets, endpoints, and the values that only exist in an environment.

## What the levels are for

- **Source** carries defaults and the per-intent blocks a component declares in its layer file,
  which is why a layer is self-contained and a realm's `server.ts` is only for what several layers
  share.
- **An rc file** carries what differs between machines and environments without editing source.
- **The command line** (`--db.connection.password=…`) is re-applied last, so it wins over every file
  and cannot be overridden by a reload.

See the [configuration pattern](../patterns/configuration.md) for the merge chain and the keys of
the framework's own components, and the [layer patterns](../patterns/layer.md) for the component,
group and realm levels a realm author writes.

## Reloading

The merged configuration is a live object: with the watcher enabled, a change to a watched rc file
re-runs the merge, computes a diff against the previous snapshot, and installs the new one in a
single assignment — no reader can observe a half-merged configuration. What happens next depends on
the component the diff touches: one that implements `configChanged` re-reads the values it cares
about and keeps its connections, while one that does not is stopped and started again.

Two limits are worth knowing before relying on it. Reload reaches the runtime and the components
with a hook, not handler code — a handler's `config` argument is a snapshot taken when its layer was
assembled. And it cannot re-resolve the intent list or override a command-line value; it moves
values within the file layers. The [config hot reload rationale](../rationale/config-hot-reload.md)
has the detail, and the [watch concept](./watch.md) covers the file watching itself.
