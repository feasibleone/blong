/**
 * index.test.ts — Tap test runner for `blong` integration tests.
 *
 * Loads both the server and browser platforms, then runs tests on each. The
 * server group asks the cluster service through `blong.flow.find` and its
 * siblings, which is the realm's whole job: the service runs in this process
 * (the framework starts it under the `dev` intent), so what the test proves is
 * that the realm reaches it and passes its answers through.
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
    load(serverSuite, 'blong-realm', 'blong-realm', intents, manifest),
    load(browserSuite, 'blong-realm', 'blong-realm', intents, manifest),
]);
await Promise.all([serverPlatform.start({}), browserPlatform.start({})]);
await tap.test('blong flow (server)', async (test: Test) => {
    await serverPlatform.test(test);
});
await tap.test('blong flow (browser)', async (test: Test) => {
    await browserPlatform.test(test);
});
await Promise.all([serverPlatform.stop(), browserPlatform.stop()]);
