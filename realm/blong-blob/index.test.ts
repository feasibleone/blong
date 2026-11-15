/**
 * index.test.ts — Tap runner for the `blob` realm.
 *
 * Both platforms are loaded because the server announces its gateway through the manifest the run
 * shares with a browser platform; a server-only run waits forever for the answer (@@F-728).
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
    load(serverSuite, 'blong-blob', 'blong-blob', intents, manifest),
    load(browserSuite, 'blong-blob', 'blong-blob', intents, manifest),
]);
await Promise.all([serverPlatform.start({}), browserPlatform.start({})]);
await tap.test('blob realm (server)', async (test: Test) => {
    await serverPlatform.test(test);
});
await tap.test('blob realm (browser)', async (test: Test) => {
    await browserPlatform.test(test);
});
await Promise.all([serverPlatform.stop(), browserPlatform.stop()]);
