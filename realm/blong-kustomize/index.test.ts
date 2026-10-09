/**
 * index.test.ts — Tap test runner for `kustomize` integration tests.
 *
 * Loads both the server and browser platforms, then runs tests on each:
 *  - server: `test.plan.find` — the plan derived from the loaded registry
 *  - server: `test.tree.generate` — the tree is reproducible and every object is
 *    fingerprinted
 *
 * There is no browser-side group. The scaffold had one that checked HTTP access control
 * (401/403/200), but this realm loads no login and no access realm — there is no user to
 * authenticate and no capability to check — so it could not have passed.
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
    load(serverSuite, 'blong-kustomize', 'blong-kustomize', intents, manifest),
    load(browserSuite, 'blong-kustomize', 'blong-kustomize', intents, manifest),
]);
await Promise.all([serverPlatform.start({}), browserPlatform.start({})]);
await tap.test('kustomize flow (server)', async (test: Test) => {
    await serverPlatform.test(test);
});
await tap.test('kustomize flow (browser)', async (test: Test) => {
    await browserPlatform.test(test);
});
await Promise.all([serverPlatform.stop(), browserPlatform.stop()]);
