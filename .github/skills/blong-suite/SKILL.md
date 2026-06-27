---
name: blong-suite
description:
    Create and configure suites in the Blong framework. Suites are the top-level organizational unit
    that group related realms and define multi-platform entry points (server, browser, desktop). Use
    this skill for each of the following distinct tasks - (1) Creating a new top-level solution or
    Blong project — follow the server/browser entry point patterns. - (2) Configuring test runners —
    follow the index.ts and internal.test.ts patterns. - (3) Wiring up multiple realms into a suite
    — follow the children and config patterns. Use this skill when the user explicitly requests any
    of these tasks, or when their request clearly aligns with one of them.
---

# Implementing a Suite

## Overview

A suite is the top-level organizational unit in the Blong framework. It groups related realms
together and defines the entry points for different platforms (server, browser, desktop). Suites:

- Glue reusable realms from packages together with local custom realms
- Take architectural decisions on how the solution is deployed
- Define configuration per deployment environment
- Provide test runner entry points

**Hierarchy:** suites → realms → layers

## File Structure

```
suite-root/
├── server.ts           # Server-side suite entry point
├── browser.ts          # Browser-side suite entry point
├── index.ts            # Re-exports server.ts (enables `blong index.ts`)
├── index.html          # Browser app HTML entry point
├── index.html.ts       # Browser app bootstrap (Vite entry — loads browser platform)
├── internal.test.ts    # Internal API tests (server only, tap coverage)
├── package.json        # Package definition
├── tsconfig.json       # TypeScript configuration
├── custom-realm-1/     # Local custom realm folder
└── custom-realm-2/     # Local custom realm folder
```

## Server Entry Point

The `server.ts` file defines the server-side suite. It imports reusable realms from packages and
includes local custom realm folders.

```typescript
// server.ts
import {server} from '@feasibleone/blong';

export default server(blong => ({
    url: import.meta.url,
    children: [
        // Reusable realms from packages — use named async functions for clarity
        async function reusableRealm1() {
            return import('reusable-realm-1/server.js');
        },
        async function reusableRealm2() {
            return import('reusable-realm-2/server.js');
        },
        // Local custom realm folders (auto-discovered)
        './custom-realm-1',
        './custom-realm-2',
    ],
    config: {
        default: {},
        microservice: {},
        dev: {},
        integration: {
            watch: {
                test: ['test.subject'], // subjects to run during integration tests
            },
        },
    },
}));
```

## Browser Entry Point

The `browser.ts` file defines the browser-side suite. It mirrors the server entry point but imports
the browser platform of each realm.

```typescript
// browser.ts
import {browser} from '@feasibleone/blong';

export default browser(blong => ({
    url: import.meta.url,
    children: [
        async function reusableRealm1() {
            return import('reusable-realm-1/browser.js');
        },
        async function reusableRealm2() {
            return import('reusable-realm-2/browser.js');
        },
        './custom-realm-1',
        './custom-realm-2',
    ],
    config: {
        default: {},
        microservice: {},
        dev: {},
        integration: {
            watch: {
                test: ['test.subject'],
            },
        },
    },
}));
```

## API Test Runner (index.ts)

The `index.ts` in a suite is a simple re-export of `server.ts`. This allows `blong index.ts` to run
the server platform by auto-detecting the `server()` kind:

```typescript
// index.ts
export {default} from './server.ts';
```

When `blong` (or `blong index.ts`) is run, the framework detects that the default export is a
`server()` definition and starts it via `runPlatform()` directly — no intermediate load callback
needed.

For running tests against both server and browser platforms simultaneously, use `internal.test.ts`
(server-side tap coverage) or the Playwright CI tests (`ci-ui`). For suites that need a custom
multi-platform test runner, see the **blong-test-api** skill.

## Browser Entry Points

The `index.html` is the HTML shell for the browser app. `index.html.ts` is the Vite TypeScript entry
point that loads the browser platform:

```typescript
// index.html.ts
import load from '@feasibleone/blong-gogo';
import browser from './browser.ts';
import pkg from './package.json' with {type: 'json'};

load(browser, pkg.name, {apiSchema: false}, ['microservice', 'integration', 'dev'])
    .then(platform => platform.start({}))
    .catch(console.error);
```

```html
<!-- index.html -->
<body>
    <div id="root"></div>
    <script
        type="module"
        src="./index.html.ts"
    ></script>
</body>
```

````

## Internal API Tests (internal.test.ts)

Internal API tests load only the server platform and run tests from the server side. They use the
`tap` testing framework to generate coverage reports. Use these when testing orchestrator logic
directly (without going through the browser/gateway).

```typescript
// internal.test.ts
import load from '@feasibleone/blong-gogo';
import tap from 'tap';

import server from './server.js';

const platform = await load(server, 'suite-name', 'suite-name', [
    'microservice', // microservice deployment wiring
    'integration', // enables test layer, watch mode
    'dev', // verbose logging, relaxed config
]);
await platform.start();
await tap.test('internal api', async test => {
    await platform.test(test);
});
await platform.stop();
````

## The `load` Function

Suites are launched by the framework via the `blong` CLI. The `load` function passed to `index.ts`
has the following signature:

```typescript
type Load = (
    definition: object, // default export of server.ts or browser.ts
    suiteName: string, // determines config file name and k8s namespace
    parentConfig: string | object, // config overrides, avoids extra config files in tests
    intents: string[], // CLI intents to apply (e.g. 'microservice', 'dev', 'integration')
) => Promise<{
    start: () => Promise<unknown>;
    test: () => Promise<unknown>;
    stop: () => Promise<unknown>;
}>;
```

The `intents` array controls which config blocks inside each realm/adapter/orchestrator are merged
in. These correspond to positional CLI arguments: `blong integration dev` passes
`['integration', 'dev']` as intents. Standard intents:

| Intent         | Purpose                                         | Process lifetime                       |
| -------------- | ----------------------------------------------- | -------------------------------------- |
| `default`      | Always active (base config — cannot be removed) | —                                      |
| `dev`          | Development — verbose logs, hot-reload          | Long-running, restarts on file changes |
| `prod`         | Production / UAT environments                   | Long-running                           |
| `integration`  | Integration testing; enables watch/test mode    | Long-running, reruns tests on change   |
| `microservice` | Enables per-layer deployment activation         | Long-running                           |
| `db`           | Database creation / seeding                     | Short-lived — exits after completion   |
| `debug`        | Expose `/api/sys/*`, include stack traces       | No effect on lifetime                  |

See the **blong-intent** skill for the full intents reference and how to create custom intents.

## Well-Known Reusable Realms

Blong provides reusable realms that can be included in any suite:

| Package                      | Purpose                                      |
| ---------------------------- | -------------------------------------------- |
| `@feasibleone/blong-test`    | Browser front end API testing (HTTP adapter) |
| `@feasibleone/blong-login`   | User authentication (JWT)                    |
| `@feasibleone/blong-openapi` | Handlers for OpenAPI definitions             |

Example including all three in a suite:

```typescript
// server.ts
import {server} from '@feasibleone/blong';

export default server(blong => ({
    url: import.meta.url,
    children: [
        async function testServer() {
            return import('@feasibleone/blong-test/server.js');
        },
        async function login() {
            return import('@feasibleone/blong-login/server.js');
        },
        async function openapi() {
            return import('@feasibleone/blong-openapi/server.js');
        },
        './custom-realm',
    ],
}));
```

```typescript
// browser.ts
import {browser} from '@feasibleone/blong';

export default browser(blong => ({
    url: import.meta.url,
    children: [
        async function testBrowser() {
            return import('@feasibleone/blong-test/browser.js');
        },
        async function login() {
            return import('@feasibleone/blong-login/browser.js');
        },
        async function openapi() {
            return import('@feasibleone/blong-openapi/browser.js');
        },
        './custom-realm',
    ],
}));
```

## Test Types

### API Tests

Cover the most common interaction — application front ends calling the API gateway. Both server and
browser are loaded; tests run from the browser side. Defined in `index.ts`. Run during development
for fast feedback.

### Internal API Tests

Cover direct calls to orchestrators (without gateway). Only the server is loaded. Defined in
`internal.test.ts`. Use `tap` for test coverage. Run in CI for coverage reports.

## Coverage for tests (ci-test / ci-coverage)

Coverage is **aggregated from several packages** into a single unified `lcov.info` report. Two
collection paths feed into the aggregation:

### Tap collection (server-side handlers)

Each package's `ci-test` runs `blong-dev test`, which wraps `tap` with:

- `--allow-incomplete-coverage --coverage-report=none`
- V8 coverage is saved into the package's `.tap/coverage/` directory automatically.

### Playwright collection (full-stack browser tests)

When a suite's `ci-test` uses `blong-dev playwright --coverage`:

- **Server-side coverage** — `blong-dev` sets `NODE_V8_COVERAGE` before spawning the blong server
  subprocess, capturing all server-handler execution as V8 JSON files.
- **Browser-side coverage** — the `coverageFixture` from
  `@feasibleone/blong-browser/playwright/coverage` runs `page.coverage.startJSCoverage()` on every
  test and writes V8-format JSON files to the same directory.
- Both server and browser coverage files are staged into the invoking package's own `.tap/coverage/`
  with a `pw-` prefix for identification.

### Aggregation (`run-coverage.sh` in `blong-gogo`)

The `ci-coverage` Rush bulk command runs `run-coverage.sh`, which:

1. Collects all `.json` coverage files from each packages's `.tap/coverage/` directory into a single
   folder, copying from (currently) `blong-int-adapter`, `test`, `blong-suite`, and `blong-marine`.
2. Runs `c8 report --temp-directory ...` from the repository root, producing `coverage/lcov.info`
   that covers source code from all included packages.

This means the final report contains coverage for tap handler tests and Playwright full-stack tests
(both server and browser code) side by side.

**Why not `--coverage-map`:** passing it with TypeScript paths causes tap to exit 1 with "No
coverage generated" because tsx compiles files in-memory and V8 coverage data doesn't match the
original `.ts` file paths.

**Key constraints:**

- `c8` must be run from the repository root, so that the path mappings in `lcov.info` are correct
  for subsequent GitHub Actions steps
- Use `-o <absolute-path>` not `--reports-directory` for the output directory

### UI Tests

These are implemented with Playwright and explained in the blong-playwright skill.

### Edge Device Tests

Simulate interactions from edge devices (ATM, POS, IoT). Loaded separately with device-specific
activations.

## Suite Naming Convention

The `suiteName` parameter passed to `load` determines:

- **Config file name:** `.ut_<suite><env>rc` — e.g. for suite `myapp` in `dev` env: `.ut_myappdevrc`
- **Default Kubernetes namespace** where the suite is deployed

Use lowercase, no spaces.

## Interaction Origins

The framework recognizes four interaction origins that suites should be designed to handle:

- **Application front ends** — browser, desktop, mobile apps (administration, management,
  user-facing)
- **Edge devices** — ATM, POS, IoT
- **Third-party systems** — core banking, payment systems, external APIs
- **Automated processes** — scheduled tasks, event-driven processes

The most common interaction for API tests is application front ends via the browser platform.

## Running Suites and Realms with `blong`

The `blong` CLI auto-detects the context based on files in the current directory:

```bash
# Run from any suite or realm folder — no arguments needed
cd core/blong-sim-tcp  &&  blong
cd core/blong-sim-api  &&  blong
cd core/blong-eip      &&  blong

# Or provide a specific file
blong index.ts
blong path/to/custom-runner.ts
```

**Auto-detection logic:**

| Files present              | Behavior                                                   |
| -------------------------- | ---------------------------------------------------------- |
| `index.ts`                 | Loads it directly (custom runner — suite or realm)         |
| `server.ts` + `browser.ts` | Public API testing: load both platforms, test from browser |
| `server.ts` only           | Internal API testing: load server platform, test directly  |
| None of the above          | Error — not a valid suite or realm folder                  |

For suites that only have `server.ts` (e.g., `blong-sim-tcp`, `blong-eip`), running `blong` from the
folder automatically starts the server, runs tests, and (in CI mode) stops the suite:

```bash
# In CI: runs tests and exits when done (process.env.CI is set)
CI=true blong
```

This makes it easy to test individual realms during development without needing a full suite setup.
When a realm or suite has an `index.ts`, it is loaded directly. If the default export is a
`server()` definition (detected via the `kind()` symbol), the framework calls `runPlatform()` on it
directly. Otherwise the export is called as a function with `load` (the legacy callback form).

## Debug Configuration

During development it is often useful to enable extra diagnostic output and runtime introspection.
Both features are controlled via the suite's `server.ts` config and should be restricted to
non-production environments (`dev` activation):

```typescript
// server.ts
import {server} from '@feasibleone/blong';

export default server(blong => ({
    url: import.meta.url,
    children: ['./my-realm'],
    config: {
        default: {},
        dev: {
            // Include stack traces and cause chains in HTTP error responses
            gateway: {debug: true},
            // Expose /api/sys/* introspection endpoints (no auth by default)
            systemDebug: {enabled: true},
        },
    },
}));
```

### System Debug Endpoints

When `systemDebug.enabled` is `true`, the gateway exposes the following endpoints:

| Endpoint               | Returns                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `GET /api/sys/config`  | Effective runtime configuration snapshot (full merged object) |
| `GET /api/sys/ports`   | Names of all registered adapter/orchestrator ports            |
| `GET /api/sys/methods` | All handler method groups with handler counts                 |
| `GET /api/sys/modules` | Names of all registered realm modules                         |
| `GET /api/sys/rpc`     | Internal RPC server address and port                          |

```bash
# Quick inspection when the gateway is running locally (default port 8080)
curl http://localhost:8080/api/sys/config  | jq .
curl http://localhost:8080/api/sys/ports   | jq .
curl http://localhost:8080/api/sys/methods | jq .
curl http://localhost:8080/api/sys/modules | jq .
curl http://localhost:8080/api/sys/rpc     | jq .
```

**Advanced options** — override in config as needed:

```typescript
systemDebug: {
    enabled: true,
    routePrefix: '/api/sys', // default; change if it conflicts with another plugin
    auth: 'jwt',             // default: false (no auth); set 'jwt' to require a token
},
```

> **Never enable `systemDebug` in production.** The `/api/sys/config` endpoint returns the full
> merged configuration snapshot. Any secrets present in the config (database passwords, API keys,
> signing keys, etc.) will be exposed as plaintext JSON. If you need to inspect config in a non-dev
> environment, set `auth: 'jwt'` and scope access to trusted users only, or exclude sensitive realms
> from the suite before starting.
