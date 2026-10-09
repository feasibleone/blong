---
name: blong-intent
description:
    Implement, configure, or extend Blong CLI intents. Intents are named CLI signals (positional
    arguments to the `blong` command) that activate configuration blocks, layers, and framework
    features. Use this skill when creating a new intent for the `blong` CLI, configuring
    intent-based activation in a realm or adapter, documenting intent behaviour for agents, or
    understanding how the existing well-known intents work. Also use this skill when a user asks
    about "activations" — that is the older term for intents.
---

# Blong Intents

## Overview

**Intents** are positional CLI arguments passed to the `blong` command that activate specific
configurations and layers. They are the primary mechanism for changing framework behaviour without
environment variables or code changes.

```bash
blong                         # default intents: microservice + integration + dev
blong integration             # only integration intent
blong ./server.ts db          # load specific file with db intent
blong integration microservice
```

Intents flow through the entire framework:

1. CLI parses them from `process.argv` (the `_` property after `minimist`)
2. `runServer.ts::autoRun` resolves which intents to apply
3. Each realm/adapter/orchestrator merges config blocks named after active intents
4. Layer activation maps check if their intent keys are in the active set

---

## When to Use This Skill

- Implementing a **new intent** (e.g. `k8s`, `migrate`, `seed`)
- Understanding which intents are valid for a given realm
- Configuring a component to respond to a custom intent
- Documenting process-lifetime behaviour of a new intent
- Translating older "activations" terminology to intents

---

## Well-Known Intents Reference

This is the reference for what each intent carries, and the place to edit when a block changes: the
concept page and the rationale keep a one-line purpose per intent and point here, so a reader can
tell them apart without duplicating a list that moves.

- **`dev`** — a watched run's defaults:
    - `resolution` on,
    - `systemDebug` exposing `/api/sys/*`
    - gateway `debug`
    - `expectedErrors`
    - the generated development sign/encrypt keys
    - error causes stack traces in replies,
    - verbose log cache and cluster transport
    - `.dev`-suffixed handler groups
    - _Long-running; restarts on file changes_
- **`release`** — the one block uat, staging and production share:
    - the log service is off, so no `semlog://` reference reaches stdout
    - service ids resolve through the cluster
    - call into a namespace this process serves stays in-process
    - It names **no layers** — a deployed process is activated by the `--<realm>.<layer>` flags its
      plan wrote
    - _long-running_
- **`integration`** — the layers a test needs (`sim`, `server/test`, the browser test layers), the
  realms under test:
    - watch/test mode over the groups an entry lists in `integration.watch.test`
    - in-process dispatch
    - `exit: isCI()`
    - _long-running; reruns tests on change; exits when `CI` is set_
- **`microservice`** — the layers that make a realm _work_: `error`, `adapter`, `orchestrator`,
  `gateway`, `server/api` when running a realm on its own:
    - **not a deployment intent**
    - _long-running_
- **`upgrade`** — schema sync plus production seeds through the owning adapter (`schema.sync` /
  `schema.seed`), with the layers those records belong to:
    - _short-lived — exits after completion_
- **`cli`** — tooling, serves nothing:
    - `gateway`, `rpcServer`, `apiGateway`, `restFs`, `systemDebug`, `mcp` and `resolution` are off,
    - watching is off
    - every dispatch resolves in-process,
    - logging is quietened to `warn`
    - the cluster service off so stdout carries the result
    - _short-lived — exits after its work_
- **`k8s`** — the same shape as `cli`:
    - the generator in place of the command: the realms the suite declares are introspected,
    - `blong-kustomize` writes `system/kustomize/`
    - _short-lived — exits after its work_
- **`playwright`** — a marker: the Playwright runner owns the process lifetime, so the platform
  outlives the test command:
    - _long-running until the runner stops it_
- **`debug`** — flags that enable debugging in **`release`** (TODO):
    - _no effect on lifetime_
- **`server`**, **`browser`**, **`ci`** _(implicit)_ — injected by the platform: `server` or
  `browser` for the platform in use, and `ci` whenever the process runs on CI:
    - colours off
    - Allure results written and the report generated
    - _no effect on lifetime_

> **Default intents:** When no intents are provided, the framework uses
> `dev + microservice + integration`. This default is designed to give developers an immediate
> feedback loop: file changes are hot-reloaded and integration tests rerun automatically, fulfilling
> the framework's "Minimising development effort" goal.

---

## Implementing a New Intent

### Step 1 — Name the intent

Follow these conventions:

- Lowercase, single word if possible: `seed`, `migrate`, `export`, `k8s`
- If two words are needed, use a hyphen: `dry-run`, `no-watch`
- The name should be the _imperative form_ of what the process will do

### Step 2 — Declare process-lifetime behaviour

Document in the realm's README and in a comment in the activation block:

| Behaviour                      | When to use                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| Process exits after completion | One-shot operations: `upgrade`, `cli`, `seed`, `export`, `k8s`                      |
| Process keeps running          | Servers, watchers, test runners: `dev`, `integration`, `microservice`, `playwright` |
| Process behaviour unchanged    | Feature flags: `debug`, `verbose`                                                   |

### Step 3 — Add the activation block to relevant components

```typescript
// adapter/db.ts
export default adapter(blong => ({
    extends: 'adapter.knex',
    activation: {
        default: {
            connection: {host: 'localhost', database: 'myapp'},
        },
        // The 'migrate' intent activates database migration on startup
        migrate: {
            // Process will exit after migration completes
            runMigrations: true,
        },
        // The 'seed' intent populates the DB with test data
        seed: {
            seedData: true,
        },
    },
}));
```

### Step 4 — Activate the intent in a layer (if it needs a dedicated layer)

If the new intent requires an entirely separate layer folder, declare it in `layer.server.ts`:

```typescript
// migrate/layer.server.ts
import {layer} from '@feasibleone/blong';

// This layer is ONLY loaded when the 'migrate' intent is active
export default layer({
    migrate: true,
});
```

### Step 5 — Wire it in the realm `server.ts` (if realm-level config is needed)

```typescript
// realm/server.ts
export default realm(blong => ({
    url: import.meta.url,
    config: {
        default: {myRealm: {mode: 'serve'}},
        migrate: {myRealm: {mode: 'migrate'}}, // override for migrate intent
        seed: {myRealm: {mode: 'seed'}},
    },
}));
```

---

## Exclusion Groups

Two intents that must not be used together are declared as an exclusion group in `server.ts`, and
the loader refuses the combination before it merges a single source: a group allows at most one of
its members to be active.

```typescript
import {server} from '@feasibleone/blong';

export default server(() => ({
    url: import.meta.url,
    intentsExclusionGroups: [
        ['dev', 'release'], // must not combine
        ['migrate', 'seed'], // run one at a time
    ],
}));
```

The message names both intents, so the command line is the answer. Nothing else is checked: an
intent pair no suite declares merges both blocks in the order given, the later one winning where
they overlap. A generated command line is a separate matter — the kustomize realm's
`deploymentIntents` (`realm/blong-kustomize/generator.ts`) _normalises_ a CR's intents rather than
checking them, so a deployment never carries a developer's intent in the first place.

---

## Example: the `k8s` Intent

The `k8s` intent instructs the framework to generate Kubernetes deployment manifests instead of
starting the server. It is implemented: `realm/blong-kustomize` owns the intent block and the
generator, and the `blong-kustomize` skill covers the pipeline. The pattern is shown below.

```typescript
// gateway/layer.server.ts — suppress gateway when generating k8s manifests
import {layer} from '@feasibleone/blong';

export default layer({
    default: true,
    k8s: false, // do NOT activate gateway during k8s generation
});
```

```typescript
// orchestrator/dispatch.ts
export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {destination: 'db', namespace: ['$subject']},
        k8s: {
            // Provide metadata needed for k8s manifest generation
            k8sReplicas: 1,
            k8sResources: {requests: {cpu: '100m', memory: '128Mi'}},
        },
    },
}));
```

The `k8s` intent implies a **short-lived** process: the framework introspects the loaded registry,
generates manifests, writes them to disk, and exits.

---

## Intent-Aware Layer Activation Reference

The framework uses this lookup when auto-discovering layers (no `layer.server.ts`):

| Folder         | Server                | Browser               |
| -------------- | --------------------- | --------------------- |
| `api`          | `{default: true}`     | `{default: true}`     |
| `init`         | `{default: true}`     | `{default: true}`     |
| `error`        | `{default: true}`     | —                     |
| `adapter`      | `{default: true}`     | `{default: true}`     |
| `orchestrator` | `{default: true}`     | —                     |
| `gateway`      | `{default: true}`     | —                     |
| `sim`          | `{integration: true}` | —                     |
| `test`         | `{integration: true}` | `{integration: true}` |
| `backend`      | —                     | `{default: true}`     |
| `component`    | —                     | `{default: true}`     |

Override any of these by adding a `layer.server.ts` / `layer.browser.ts` to the folder.

---

## How Intents Flow Through `index.ts`

When a suite has an `index.ts`, it receives a `load` function and passes intents explicitly:

```typescript
// index.ts
export default async load => {
    const intents = ['microservice', 'integration', 'dev'];
    const [serverPlatform, browserPlatform] = await Promise.all([
        load(server, 'my-suite', 'my-suite', intents),
        load(browser, 'my-suite', 'my-suite', intents),
    ]);
    for (const p of [serverPlatform, browserPlatform]) await p.start();
    await browserPlatform.test();
    if (process.env.CI) for (const p of [serverPlatform, browserPlatform]) await p.stop();
};
```

The `intents` array is also automatically populated from the CLI arguments — the fourth parameter to
`load()` overrides the CLI-provided intents for that particular platform. Use this to have different
intents per platform.

---

## A CLI declares its own layers

`cli` appears in no entry of `WELL_KNOWN_LAYERS`, so it activates nothing by itself: a package that
ships a command names the layer folders the command runs with, in the `cli` block of the realm whose
handlers it dispatches.

```typescript
// the realm's own server.ts — the realm says what its command needs (D-436)
export default realm(() => ({
    url: import.meta.url,
    config: {
        cli: {error: {}, adapter: {}, orchestrator: {}},
    },
}));
```

The value per folder is the folder's config for that intent, so `{}` is the ordinary "on, with no
opinion of my own". A folder a command has no use for is left out rather than declared: compare what
the realm actually serves through (`blong-kustomize` names no `gateway`, because no command answers
HTTP) and remember that a command that delegates its real work to a child process — a tree generator
re-running the framework with `k8s` — names only what _its own_ process loads. `CliOptions.intents`
stays what it was: the intents every realm CLI runs under, defaulting to `['cli']`.

---

## Checklist for New Intent Implementation

- [ ] Intent name follows lowercase-word convention
- [ ] Process-lifetime documented (short-lived vs long-running)
- [ ] `activation` blocks added to all affected adapters/orchestrators
- [ ] `layer.server.ts` added if a dedicated layer is needed
- [ ] Realm-level `config` block added if realm-level overrides needed
- [ ] Exclusion groups declared in `server.ts` if applicable
- [ ] Intent documented in realm/suite README
- [ ] Relevant skills updated if intent has framework-wide impact
