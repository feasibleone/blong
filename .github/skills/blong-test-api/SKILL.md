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

## Wiring test groups: `integration.watch.test`

Both platforms declare which test groups to run under the `integration` intent via `watch.test` —
a list of group names. A test handler keyed `testRegistrationFlow` registers a group named
`test.registration.flow` (the key is normalised by `methodParts`), so the list entry must be that
derived name, not the raw key.

Server-side groups are declared in the suite's `index.ts` / `server.ts`:

```ts
config: {
    integration: {
        watch: {test: ['test.login.flow', 'test.authorization.flow', 'test.registration.flow']},
    },
},
```

**Browser-side groups must be declared in the BROWSER suite too.** The browser platform does not
automatically run every `browser/test/test` group — if a group is missing from the browser suite's
`integration.watch.test` it silently never executes (coverage then reports "incomplete" functions
and the test is never asserted). When a realm runs a browser half of the tap runner (see below),
add the group there as well.

## Browser-side test suite (`browser-test.ts`)

When the public API is tested from a simulated browser via the `index.test.ts` tap runner, the
runner loads BOTH the server definition (`index.ts` / `server.ts`) and a browser definition —
conventionally `browser-test.ts` — and runs each platform's `test()` in its own tap block:

```ts
// index.test.ts
import load from '@feasibleone/blong-gogo';
import tap, {Test} from 'tap';
import browserSuite from './browser-test.ts';
import serverSuite from './index.ts';

const intents = ['microservice', 'integration', 'dev'];
const manifest: Record<string, unknown> = {};
const [serverPlatform, browserPlatform] = await Promise.all([
    load(serverSuite, 'realm', 'realm', intents, manifest),
    load(browserSuite, 'realm', 'realm', intents, manifest),
]);
await Promise.all([serverPlatform.start({}), browserPlatform.start({})]);
await tap.test('realm login flow (server)', async (test: Test) => serverPlatform.test(test));
await tap.test('realm login flow (browser)', async (test: Test) => browserPlatform.test(test));
await Promise.all([serverPlatform.stop(), browserPlatform.stop()]);
```

`browser-test.ts` is a `browser()` definition that loads `@feasibleone/blong-test/browser.ts` (test
dispatch + backend HTTP adapter), `@feasibleone/blong-login/browser.ts` and the realm's own
`browser.ts`. Its `testClient.backend.namespace` config lists the namespaces the browser proxies to
the server gateway over HTTP, and its `integration.watch.test` lists the browser-side groups:

```ts
// browser-test.ts
export default browser(blong => ({
    url: import.meta.url,
    children: [
        async function testClient() {
            return import('@feasibleone/blong-test/browser.ts');
        },
        async function login() {
            return import('@feasibleone/blong-login/browser.ts');
        },
        async function access() {
            return import('./browser.ts');
        },
    ],
    config: {
        integration: {
            testClient: {backend: {namespace: ['access', 'login']}},
            access: {},
            watch: {test: ['test.authorization.flow', 'test.registration.flow']},
        },
    },
}));
```

> **Gotcha:** the framework hands each step its dependency step's **return value**. A step that a
> later step destructures MUST `return` that data — otherwise the next step throws
> `Cannot destructure property 'x' of (intermediate value) as it is undefined.` Every step that
> produces data consumed downstream (credentials, ids, tokens) must explicitly `return` it.

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
