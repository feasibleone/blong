---
name: blong-test-api
description:
    Set up the test entry point to run Blong tests against the public or internal API. Covers
    loading server and browser platforms in index.ts, wiring the @feasibleone/blong-test package,
    and choosing between public API testing (browser-simulated) and internal API testing
    (server-only). Use this skill whenever setting up the test runner entry point for a suite,
    configuring index.ts for test execution, or deciding how to connect tests to a running platform
    — even if the user just says 'how do I run the tests' or 'set up the test entry point'.
---

# Test API Entry Points

## Overview

Before test handlers run, the suite needs an entry point (`index.ts`) that loads the platform(s),
starts them, and triggers test execution. The two approaches differ in which platforms are loaded
and from which side the tests are initiated.

## Declarative index.ts (recommended for suites)

The simplest form is a direct re-export of the suite's `server.ts`. The framework detects that the
default export is a `server()` definition and runs it via `runPlatform()` directly — no `load`
callback needed:

```ts
// index.ts
export {default} from './server.ts';
```

Use this when the suite's server tests and browser platform are already wired via Playwright CI
tests (`ci-ui`) and internal server tests (`internal.test.ts`).

## Public API testing (multi-platform callback)

The most frequently used approach. Tests are initiated from a simulated browser-side orchestrator
(`testDispatch`) that calls the server's public API gateway over HTTP — the same path a real browser
front end would use. This avoids having to test from every possible front end (mobile, browser,
edge).

The orchestrator (`testDispatch`) and its HTTP adapter (`backend`) come as a reusable realm in the
`@feasibleone/blong-test` package. Include it in both `server.ts` and `browser.ts`:

```ts
// server.ts
import {server} from '@feasibleone/blong';

export default server(blong => ({
    url: import.meta.url,
    children: [
        async function testServer() {
            return import('@feasibleone/blong-test/server.js');
        },
        // other realms...
    ],
}));
```

```ts
// browser.ts
import {browser} from '@feasibleone/blong';

export default browser(blong => ({
    url: import.meta.url,
    children: [
        async function testBrowser() {
            return import('@feasibleone/blong-test/browser.js');
        },
        // other realms...
    ],
}));
```

The `index.ts` loads both platforms and runs tests from the browser side:

```ts
// index.ts
import browser from './browser.ts';
import server from './server.ts';

type Load = (
    def: object, // the server or browser definition as factory function
    suiteName: string, // the suite name
    parentConfig: string | object, // configuration overrides for the suite
    intents: string[], // CLI intents to apply (e.g. 'microservice', 'integration', 'dev')
) => Promise<{
    start: () => Promise<unknown>;
    test: () => Promise<unknown>;
    stop: () => Promise<unknown>;
}>;

export default async (load: Load): Promise<void> => {
    // The manifest is a shared object passed to both load() calls so that
    // the two platforms can exchange runtime values (e.g. effective ports,
    // connection strings, or other lifecycle state). Pass the same reference
    // to both load() calls — writes from one side are visible to the other.
    const manifest: Record<string, unknown> = {};
    const platforms: Awaited<ReturnType<typeof load>>[] = await Promise.all([
        load(server, 'suite-name', 'suite-name', ['microservice', 'integration', 'dev'], manifest),
        load(browser, 'suite-name', 'suite-name', ['microservice', 'integration', 'dev'], manifest),
    ]);
    for (const platform of platforms) await platform.start();
    await platforms[1].test();
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (process.env.CI) for (const platform of platforms) await platform.stop();
};
```

## Internal API testing

Sometimes it only makes sense to initiate the tests from the server side, calling directly the
internal API — for example when testing an integration layer or an EIP pipeline that has no
browser-facing endpoint.

In this case the `testDispatch` orchestrator is included and activated in the test layer of one of
the realms instead of coming from `@feasibleone/blong-test`. Only the server platform needs to be
loaded:

```ts
// index.ts
import server from './server.ts';

type Load = (...params: unknown[]) => Promise<{
    start: () => Promise<unknown>;
    test: () => Promise<unknown>;
}>;

export default async (load: Load): Promise<void> => {
    const platforms: Awaited<ReturnType<typeof load>>[] = await Promise.all([
        load(server, 'suite-name', 'suite-name', ['microservice', 'integration', 'dev']),
    ]);
    for (const platform of platforms) await platform.start();
    await platforms[0].test();
    if (process.env.CI) for (const platform of platforms) await platform.stop();
};
```

An example of this test approach is available in the [blong-eip](../../../core/blong-eip) package.

## Choosing between the two

| Situation                                                       | Approach                       |
| --------------------------------------------------------------- | ------------------------------ |
| Testing business logic exposed via the public API gateway       | Public API (browser-simulated) |
| Testing an integration layer, EIP pipeline, or internal adapter | Internal API (server-only)     |
| Want tests to exercise the full HTTP request/response path      | Public API                     |
| Back end has no browser-facing endpoints                        | Internal API                   |

## Related skills

- **blong-test** — Writing the test handlers themselves (steps, assertions, parallel execution)
- **blong-mock-test** — Replacing adapters with mock handlers instead of calling the real backend
- **blong-test-sim** — Simulating HTTP or TCP backends locally for integration tests
- **blong-test-int** — Provisioning real backend services in Kubernetes for CI integration tests
