/**
 * index.test.ts — Tap test runner for `$subject` integration tests.
 *
 * Loads both the server and browser platforms, then runs tests on each:
 *  - server: `test.$object` — add a `$object` then find it
 *  - browser: `test.$object.flow` — HTTP-level access control (401/403/200)
 *
 * Usage:
 *   node --run ci-test    (via blong-dev test, which uses this file)
 *   node index.test.ts    (direct tap invocation)
 */
import load from '@feasibleone/blong-gogo';
import tap, {Test} from 'tap';

import browserSuite from './browser-test.ts';
import serverSuite from './index.ts';

const intents = ['microservice', 'integration', 'dev', ...(process.env.CI ? ['ci'] : [])];
const manifest: Record<string, unknown> = {};

const [serverPlatform, browserPlatform] = await Promise.all([
    load(serverSuite, '$subject', '$subject', intents, manifest),
    load(browserSuite, '$subject', '$subject', intents, manifest),
]);
await Promise.all([serverPlatform.start({}), browserPlatform.start({})]);
await tap.test('$subject flow (server)', async (test: Test) => {
    await serverPlatform.test(test);
});
await tap.test('$subject flow (browser)', async (test: Test) => {
    await browserPlatform.test(test);
});
await Promise.all([serverPlatform.stop(), browserPlatform.stop()]);
