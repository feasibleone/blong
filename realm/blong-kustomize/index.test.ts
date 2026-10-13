/**
 * index.test.ts — Tap runner for the `kustomize` integration tests: `test.plan.find` and
 * `test.tree.generate` on the server, and no browser-side group.
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
