---
name: blong-intent
description: Implement, configure, or extend Blong CLI intents. Intents are named CLI signals (positional arguments to the `blong` command) that activate configuration blocks, layers, and framework features. Use this skill when creating a new intent for the `blong` CLI, configuring intent-based activation in a realm or adapter, documenting intent behaviour for agents, or understanding how the existing well-known intents work. Also use this skill when a user asks about "activations" — that is the older term for intents.
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

| Intent | Layer / config activated | Process lifetime |
|--------|--------------------------|-----------------|
| `dev` | Verbose logs, hot-reload, debug-friendly config | Long-running; restarts on file changes |
| `prod` | Production endpoints, strict config | Long-running; no restart |
| `integration` | Test layer, watch mode, test-runner | Long-running; reruns tests on change; exits on CI |
| `microservice` | Activates layers needed to run a realm as a standalone microservice | Long-running; no restart |
| `db` | DB creation / seeding adapters | **Short-lived** — exits after completion |
| `debug` | `/api/sys/*` endpoints, stack traces in errors | No effect on lifetime |
| `server` *(implicit)* | Always injected on server platform | — |
| `browser` *(implicit)* | Always injected on browser platform | — |

> **Default intents:** When no intents are provided, the framework uses `dev + microservice +
> integration`. This default is designed to give developers an immediate feedback loop: file changes
> are hot-reloaded and integration tests rerun automatically, fulfilling the framework's
> "Minimising development effort" goal.

---

## Implementing a New Intent

### Step 1 — Name the intent

Follow these conventions:
- Lowercase, single word if possible: `seed`, `migrate`, `export`, `k8s`
- If two words are needed, use a hyphen: `dry-run`, `no-watch`
- The name should be the _imperative form_ of what the process will do

### Step 2 — Declare process-lifetime behaviour

Document in the realm's README and in a comment in the activation block:

| Behaviour | When to use |
|-----------|------------|
| Process exits after completion | One-shot operations: `db`, `seed`, `export`, `k8s` |
| Process keeps running | Servers, watchers: `dev`, `integration`, `microservice` |
| Process behaviour unchanged | Feature flags: `debug`, `verbose` |

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
        migrate: {myRealm: {mode: 'migrate'}},   // override for migrate intent
        seed:    {myRealm: {mode: 'seed'}},
    },
}));
```

---

## Exclusion Groups

When two intents should not be used together, declare an exclusion group in `server.ts`:

```typescript
export default server(blong => ({
    url: import.meta.url,
    intentsExclusionGroups: [
        ['dev', 'prod'],        // must not combine
        ['migrate', 'seed'],    // run one at a time
    ],
}));
```

The framework will log a warning if incompatible intents are detected at startup.

Default exclusion groups (no declaration needed):
- `['dev', 'prod']`
- `['server', 'browser']` (implicit — one process is one platform)

---

## Example: the `k8s` Intent (Planned)

The `k8s` intent will instruct the framework to generate Kubernetes deployment manifests instead of
(or in addition to) starting the server. Implementation pattern:

```typescript
// gateway/layer.server.ts — suppress gateway when generating k8s manifests
import {layer} from '@feasibleone/blong';

export default layer({
    default: true,
    k8s: false,   // do NOT activate gateway during k8s generation
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

| Folder | Server | Browser |
|--------|--------|---------|
| `api` | `{default: true}` | `{default: true}` |
| `init` | `{default: true}` | `{default: true}` |
| `error` | `{default: true}` | — |
| `adapter` | `{default: true}` | `{default: true}` |
| `orchestrator` | `{default: true}` | — |
| `gateway` | `{default: true}` | — |
| `sim` | `{integration: true}` | — |
| `test` | `{integration: true}` | `{integration: true}` |
| `backend` | — | `{default: true}` |
| `component` | — | `{default: true}` |

Override any of these by adding a `layer.server.ts` / `layer.browser.ts` to the folder.

---

## How Intents Flow Through `index.ts`

When a suite has an `index.ts`, it receives a `load` function and passes intents explicitly:

```typescript
// index.ts
export default async (load) => {
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

The `intents` array is also automatically populated from the CLI arguments — the fourth parameter
to `load()` overrides the CLI-provided intents for that particular platform. Use this to have
different intents per platform.

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
