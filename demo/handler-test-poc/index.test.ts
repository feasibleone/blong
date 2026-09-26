/**
 * index.test.ts — the tap runner for the handler-test POC.
 *
 * Loads both platforms and runs the suite's test groups on the **browser** side, which is
 * where `browser.ts` lists them: the browser reaches the order handlers through the test
 * client, so the run goes over the same call path a real caller does.
 *
 * Usage:
 *   node --run test    (via blong-dev test, which uses this file)
 */
import load from '@feasibleone/blong-gogo';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import tap, {Test} from 'tap';

import browserSuite from './browser.ts';
import serverSuite from './server.ts';

const intents = ['microservice', 'integration', 'dev', ...(process.env.CI ? ['ci'] : [])];
const manifest: Record<string, unknown> = {};

const [serverPlatform, browserPlatform] = await Promise.all([
    load(serverSuite, 'handler-test-poc', 'handler-test-poc', intents, manifest),
    load(browserSuite, 'handler-test-poc', 'handler-test-poc', intents, manifest),
]);
await Promise.all([serverPlatform.start({}), browserPlatform.start({})]);
await tap.test('handler-test-poc scenarios', async (test: Test) => {
    await browserPlatform.test(test);
});
await Promise.all([serverPlatform.stop(), browserPlatform.stop()]);
