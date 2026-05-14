---
name: blong-suite
description: Create and configure suites in the Blong framework. Suites are the top-level organizational unit that group related realms and define multi-platform entry points (server, browser, desktop). Use this skill for each of the following distinct tasks
  - (1) Creating a new top-level solution or Blong project — follow the server/browser entry point patterns.
  - (2) Configuring test runners — follow the index.ts and internal.test.ts patterns.
  - (3) Wiring up multiple realms into a suite — follow the children and config patterns.
  Use this skill when the user explicitly requests any of these tasks, or when their request clearly aligns with one of them.
---

# Implementing a Suite

## Overview

A suite is the top-level organizational unit in the Blong framework. It groups related realms together and defines the entry points for different platforms (server, browser, desktop). Suites:

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
├── index.ts            # API test runner (server + browser)
├── internal.test.ts    # Internal API tests (server only, tap coverage)
├── package.json        # Package definition
├── tsconfig.json       # TypeScript configuration
├── custom-realm-1/     # Local custom realm folder
└── custom-realm-2/     # Local custom realm folder
```

## Server Entry Point

The `server.ts` file defines the server-side suite. It imports reusable realms from packages and includes local custom realm folders.

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

The `browser.ts` file defines the browser-side suite. It mirrors the server entry point but imports the browser platform of each realm.

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

The `index.ts` file is the primary test entry point. It loads both the server and browser platforms and runs tests from the browser side. This simulates the most common interaction — application front ends — at the lowest possible latency.

The browser platform is preferred for API tests because:

- Fastest to run in Node.js
- Closest to the most common interaction (browser front end)
- Uses the same components as the real browser front end

```typescript
// index.ts
import browser from './browser.js';
import server from './server.js';

type Load = (
    definition: object,
    suiteName: string,
    parentConfig: string | object,
    intents: string[], // CLI intents to apply (e.g. 'microservice', 'dev', 'integration')
) => Promise<{
    start: () => Promise<unknown>;
    test: () => Promise<unknown>;
    stop: () => Promise<unknown>;
}>;

export default async (load: Load): Promise<void> => {
    const platforms: Awaited<ReturnType<typeof load>>[] = await Promise.all([
        load(server, 'suite-name', 'suite-name', ['microservice', 'integration', 'dev']),
        load(browser, 'suite-name', 'suite-name', ['microservice', 'integration', 'dev']),
    ]);
    for (const platform of platforms) await platform.start();
    await platforms[1].test(); // run tests from the browser side
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (process.env.CI) for (const platform of platforms) await platform.stop();
};
```

## Internal API Tests (internal.test.ts)

Internal API tests load only the server platform and run tests from the server side. They use the `tap` testing framework to generate coverage reports. Use these when testing orchestrator logic directly (without going through the browser/gateway).

```typescript
// internal.test.ts
import load from '@feasibleone/blong-gogo';
import tap from 'tap';

import server from './server.js';

const platform = await load(server, 'suite-name', 'suite-name', [
    'microservice', // microservice deployment wiring
    'integration',  // enables test layer, watch mode
    'dev',          // verbose logging, relaxed config
]);
await platform.start();
await tap.test('internal api', async test => {
    await platform.test(test);
});
await platform.stop();
```

## The `load` Function

Suites are launched by the framework via the `blong` CLI. The `load` function passed to `index.ts` has the following signature:

```typescript
type Load = (
    definition: object, // default export of server.ts or browser.ts
    suiteName: string,  // determines config file name and k8s namespace
    parentConfig: string | object, // config overrides, avoids extra config files in tests
    intents: string[],  // CLI intents to apply (e.g. 'microservice', 'dev', 'integration')
) => Promise<{
    start: () => Promise<unknown>;
    test: () => Promise<unknown>;
    stop: () => Promise<unknown>;
}>;
```

The `intents` array controls which config blocks inside each realm/adapter/orchestrator are merged
in. These correspond to positional CLI arguments: `blong integration dev` passes
`['integration', 'dev']` as intents. Standard intents:

| Intent         | Purpose                                       | Process lifetime |
| -------------- | --------------------------------------------- | ---------------- |
| `default`      | Always active (base config — cannot be removed) | — |
| `dev`          | Development — verbose logs, hot-reload        | Long-running, restarts on file changes |
| `prod`         | Production / UAT environments                 | Long-running |
| `integration`  | Integration testing; enables watch/test mode  | Long-running, reruns tests on change |
| `microservice` | Enables per-layer deployment activation       | Long-running |
| `db`           | Database creation / seeding                   | Short-lived — exits after completion |
| `debug`        | Expose `/api/sys/*`, include stack traces     | No effect on lifetime |

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

Cover the most common interaction — application front ends calling the API gateway. Both server and browser are loaded; tests run from the browser side. Defined in `index.ts`. Run during development for fast feedback.

### Internal API Tests

Cover direct calls to orchestrators (without gateway). Only the server is loaded. Defined in `internal.test.ts`. Use `tap` for test coverage. Run in CI for coverage reports.

## Coverage for unit tests (ci-unit / ci-coverage)

All packages that cover `blong-gogo` source files share a single script:
`core/common/run-coverage.sh`. It runs `tap` and (when called with `report`) generates
`coverage/lcov.info` via `c8`.

### How it works

- `tap` v21 collects V8 coverage by default into `.tap/coverage/` — no `--coverage-map` needed.
- `--allow-incomplete-coverage --coverage-report=none` prevent tap from printing a table or
  failing on thresholds; the report is generated separately by `c8`.
- `c8 report` runs from `REPORT_CWD` (defaults to `core/`) so the `--include` glob
  `blong-gogo/src/**/*.ts` resolves correctly against sibling-package source files.
- `COVERAGE_INCLUDE` and `COVERAGE_EXCLUDE` default to `blong-gogo/src/**/*.ts` — hardcoded
  because the script is purpose-built to track that package's coverage.

**Why not `--coverage-map`:** passing it with TypeScript paths causes tap to exit 1 with
"No coverage generated" because tsx compiles files in-memory and V8 coverage data doesn't
match the original `.ts` file paths.

### package.json scripts

Packages call the shared script directly — no per-package wrapper needed:

```json
{
    "scripts": {
        "ci-unit":     "../common/run-coverage.sh",
        "ci-coverage": "../common/run-coverage.sh report"
    }
}
```

**Key constraints:**
- `c8` must be run from a directory that is an ancestor of all source files being reported on
- Use `-o <absolute-path>` not `--reports-directory` for the output directory
- `ci-coverage` is self-contained (runs tests first) — safe to run on any CI machine

### CI artifact pipeline
`ci-coverage` is self-contained (runs tests + emits `coverage/lcov.info` in one step) so it works
correctly when the `coverage` job runs on a separate CI machine from `unit-tests`.

The `coverage` job downloads both `unit-coverage` and `integration-coverage`, merges them, and
posts a PR comment using `romeovs/lcov-reporter-action`:
```yaml
coverage:
  needs: [setup, unit-tests, integration]
  if: always() && needs.setup.result == 'success' && needs.unit-tests.result != 'cancelled'
  permissions:
    pull-requests: write
  steps:
    - uses: actions/checkout@v6
    - uses: actions/download-artifact@v5
      continue-on-error: true
      with: {name: unit-coverage}
    - uses: actions/download-artifact@v5
      continue-on-error: true
      with: {name: integration-coverage}
    - name: Merge lcov files
      id: merge
      run: |
        shopt -s globstar extglob nullglob
        files=(+(app|core|ext|library)/*/coverage/lcov.info)
        [[ ${#files[@]} -gt 0 ]] && echo "exists=true" >> $GITHUB_OUTPUT && cat "${files[@]}" > merged-lcov.info || echo "exists=false" >> $GITHUB_OUTPUT
    - if: steps.merge.outputs.exists == 'true'
      uses: romeovs/lcov-reporter-action@v0.4.0
      with:
        lcov-file: merged-lcov.info
        github-token: ${{ secrets.GITHUB_TOKEN }}
```

### UI Tests

Not yet implemented. Planned to run full browser app with Playwright.

### Edge Device Tests

Simulate interactions from edge devices (ATM, POS, IoT). Loaded separately with device-specific activations.

## Suite Naming Convention

The `suiteName` parameter passed to `load` determines:

- **Config file name:** `.ut_<suite><env>rc` — e.g. for suite `myapp` in `dev` env: `.ut_myappdevrc`
- **Default Kubernetes namespace** where the suite is deployed

Use lowercase, no spaces.

## Interaction Origins

The framework recognizes four interaction origins that suites should be designed to handle:

- **Application front ends** — browser, desktop, mobile apps (administration, management, user-facing)
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

For suites that only have `server.ts` (e.g., `blong-sim-tcp`, `blong-eip`), running `blong` from
the folder automatically starts the server, runs tests, and (in CI mode) stops the suite:

```bash
# In CI: runs tests and exits when done (process.env.CI is set)
CI=true blong
```

This makes it easy to test individual realms during development without needing a full suite setup.
When a realm has an `index.ts`, it is loaded directly — useful when the realm depends on other realms
and needs custom initialization.

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
> signing keys, etc.) will be exposed as plaintext JSON. If you need to inspect config in a
> non-dev environment, set `auth: 'jwt'` and scope access to trusted users only, or exclude
> sensitive realms from the suite before starting.
