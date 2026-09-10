/**
 * index.test.ts — Tap test runner for blong-party integration tests.
 *
 * Loads both the server and browser platforms, then runs tests on the
 * browser side.  The browser platform proxies business calls (login,
 * registration) to the server gateway via the backend HTTP adapter,
 * closely resembling a real browser integration.
 *
 * The browser-side registration flow here is the API-level (HTTP) coverage;
 * UI regressions are covered separately by the Playwright tests
 * (`selfRegistration.play.ts`, `googleLogin.play.ts`).
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
    load(serverSuite, 'blong-party', 'blong-party', intents, manifest),
    load(browserSuite, 'blong-party', 'blong-party', intents, manifest),
]);
await Promise.all([serverPlatform.start({}), browserPlatform.start({})]);
await tap.test('blong-party registration flow (server)', async (test: Test) => {
    await serverPlatform.test(test);
});
await tap.test('blong-party registration flow (browser)', async (test: Test) => {
    await browserPlatform.test(test);
});
await Promise.all([serverPlatform.stop(), browserPlatform.stop()]);
