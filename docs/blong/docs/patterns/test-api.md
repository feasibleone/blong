# Test API Entry Point

Before test handlers run, the suite needs an `index.ts` that loads the platform(s), starts them,
and triggers test execution. There are two approaches depending on what is being tested.

## Public API Testing (recommended)

Tests are initiated from a simulated browser-side orchestrator (`testDispatch`) that calls the
server's public API gateway over HTTP — the same path a real browser or mobile client would use.

The `testDispatch` orchestrator and its HTTP `backend` adapter are provided by the
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
    def: object,
    suiteName: string,
    parentConfig: string | object,
    activations: string[],
) => Promise<{
    start: () => Promise<unknown>;
    test: () => Promise<unknown>;
    stop: () => Promise<unknown>;
}>;

export default async (load: Load): Promise<void> => {
    // The manifest is a shared object for exchanging runtime values between
    // platforms (e.g. effective ports, connection strings, or other
    // lifecycle state). Pass the same reference to both load() calls —
    // values written by one side are visible to the other.
    const manifest: Record<string, unknown> = {};
    const platforms = await Promise.all([
        load(server, 'suite-name', 'suite-name', ['microservice', 'integration', 'dev'], manifest),
        load(browser, 'suite-name', 'suite-name', ['microservice', 'integration', 'dev'], manifest),
    ]);
    for (const platform of platforms) await platform.start();
    await platforms[1].test(); // run tests from browser side
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (process.env.CI) for (const platform of platforms) await platform.stop();
};
```

## Internal API Testing

Use this approach when testing an integration layer, EIP pipeline, or adapter that has no
browser-facing endpoint. Only the server platform is loaded, and tests run from the server side.

```ts
// index.ts
import server from './server.ts';

type Load = (...params: unknown[]) => Promise<{
    start: () => Promise<unknown>;
    test: () => Promise<unknown>;
}>;

export default async (load: Load): Promise<void> => {
    const platforms = await Promise.all([
        load(server, 'suite-name', 'suite-name', ['microservice', 'integration', 'dev']),
    ]);
    for (const platform of platforms) await platform.start();
    await platforms[0].test();
    if (process.env.CI) for (const platform of platforms) await platform.stop();
};
```

An example of this approach is in `core/blong-eip/`.

## Choosing Between the Two

| Situation | Approach |
| --- | --- |
| Testing business logic exposed via the public API gateway | Public API (browser-simulated) |
| Testing an EIP pipeline, integration layer, or internal adapter | Internal API (server-only) |
| Want tests to exercise the full HTTP request/response path | Public API |
| Back end has no browser-facing endpoints | Internal API |

## Related Patterns

- [test](./test.md) — Writing test handler steps and parallel execution
- [mock-test](./mock-test.md) — Replacing real adapters with mock handlers
- [suite](./suite.md) — Full suite structure with server and browser entry points
