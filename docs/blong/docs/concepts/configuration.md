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

## Where the configuration came from

A root load writes one record naming what it read: the rc files, in merge order; the environment
variable names it matched; and the command-line keys that carried a value. Names only — never
values, so a secret in an rc file or an environment variable is not copied into a log line.

```text
info  blong config event config.load
  files: ["/repo/.blong_devrc"]
  env: ["BLONG_MASTER_KEY"]
  argv: ["log"]
```

## Validation

A realm, suite, adapter or orchestrator may declare the keys its config block accepts, as a TypeBox
schema:

```typescript
export default adapter(blong => ({
    extends: 'adapter.knex',
    validation: blong.type.Object({
        namespace: blong.type.Union([blong.type.String(), blong.type.Array(blong.type.String())]),
        logLevel: blong.type.Optional(blong.type.String()),
    }),
}));
```

The load checks each module's config block against it and fails at startup with the offending path,
so an override addressed one key too shallow — `--kustomize.outputDir` where the port is
`kustomize.deploy` — is named rather than dropped in silence. A key is allowed when the module
declared it, when it is one of the module's children, when it names a port the module registered,
when the module's own source config names it, when the module's parent declared it in its block for
this module, or when it is one of the keys the load itself merged in — a handler group's own
`config.ts` becomes a key of its realm's block. The last two are why a suite root may configure a
child realm (`commander: {showParentRow: true}`) without the realm repeating the key.

Two limits are deliberate. A module that declares no schema has no way to say which keys are
legitimate, so its own keys cannot be judged — only the platform root narrows the check to the keys
the command line introduced, because a shared rc file carries keys for every suite in the
repository. That narrowing is empty under the `cli` intent, where the command line is the command's
interface rather than configuration: `runCli` parses those flags itself and passes them as handler
params, so a flag that also lands in the config is not an override. And the schema is used for
unknown keys and types only: `required` keys and unknown keys inside a declared nested object are
not enforced yet, because the schemas the repository ships are still incomplete.

The check runs as the process loads, and again before a reloaded snapshot is installed: an rc edit
that introduces an unknown key is refused, the previous configuration stays in place, and the
rejection is reported. The same check survives the edit because a module's validator re-reads its
block from the candidate snapshot with a getter threaded down through the load.

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

A log level is the one setting no port owns, so it is applied directly instead: a change to
`log.level` re-points the process logger's threshold, and a component whose own `logLevel` changed
has its logger re-created — neither restarts anything.
