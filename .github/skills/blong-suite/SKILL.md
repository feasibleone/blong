---
name: blong-suite
description: Create and configure suites in the Blong framework. Suites are the top-level organizational unit that group related realms and define multi-platform entry points (server, browser, desktop). Covers server/browser suite definitions, API test runner setup (index.ts), internal API tests, and well-known reusable realms. Make sure to use this skill whenever creating a new top-level solution, setting up a new Blong project, configuring test runners, or wiring up multiple realms — even if the user just says 'create a new project' or 'set up the entry point'.
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
    activations: string[],
) => Promise<{
    start: () => Promise<unknown>;
    test: () => Promise<unknown>;
    stop: () => Promise<unknown>;
}>;

export default async (load: Load): Promise<void> => {
    const realms: Awaited<ReturnType<typeof load>>[] = await Promise.all([
        load(server, 'suite-name', 'suite-name', ['microservice', 'integration', 'dev']),
        load(browser, 'suite-name', 'suite-name', ['microservice', 'integration', 'dev']),
    ]);
    for (const realm of realms) await realm.start();
    await realms[1].test(); // run tests from the browser side
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (process.env.CI) for (const realm of realms) await realm.stop();
};
```

## Internal API Tests (internal.test.ts)

Internal API tests load only the server platform and run tests from the server side. They use the `tap` testing framework to generate coverage reports. Use these when testing orchestrator logic directly (without going through the browser/gateway).

```typescript
// internal.test.ts
import load from '@feasibleone/blong-gogo';
import tap from 'tap';

import server from './server.js';

const realm = await load(server, 'suite-name', 'suite-name', [
    'microservice',
    'dev',
    'test',
    'integration',
]);
await realm.start();
await tap.test('internal api', async test => {
    await realm.test(test);
});
await realm.stop();
```

## The `load` Function

Suites are launched by the framework via the `blong` CLI. The `load` function passed to `index.ts` has the following signature:

```typescript
type Load = (
    definition: object, // default export of server.ts or browser.ts
    suiteName: string, // determines config file name (.ut_<suite><env>rc) and k8s namespace
    parentConfig: string | object, // config overrides, avoids extra config files in tests
    activations: string[], // config activations to apply (e.g. 'microservice', 'dev', 'integration')
) => Promise<{
    start: () => Promise<unknown>;
    test: () => Promise<unknown>;
    stop: () => Promise<unknown>;
}>;
```

The `activations` array controls which config blocks inside each realm/adapter/orchestrator are merged in. Standard activations:

| Activation     | Purpose                                      |
| -------------- | -------------------------------------------- |
| `default`      | Always active (base config)                  |
| `dev`          | Development environment                      |
| `prod`         | Production / UAT environments                |
| `test`         | Automated testing                            |
| `microservice` | Enables per-layer deployment activation      |
| `integration`  | Integration testing; enables watch/test mode |

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
