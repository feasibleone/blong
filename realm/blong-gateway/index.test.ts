/**
 * index.test.ts — Tap test runner for blong-gateway integration tests.
 *
 * Loads both the server and browser platforms, then runs tests on both.
 * The browser platform proxies business calls (login, gateway management,
 * meterprobe.*, vision.compute) to the server gateway via the backend HTTP
 * adapter, exercising the real ApiGateway metering plugin over HTTP (no mocks)
 * against real MySQL + Redis.
 *
 * Usage:
 *   node --run ci-test    (via blong-dev test, which uses this file)
 *   node index.test.ts    (direct tap invocation)
 */
import load from '@feasibleone/blong-gogo';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import tap, {Test} from 'tap';

import browserSuite from './browser-test.ts';
import serverSuite from './index.ts';

const intents = ['microservice', 'integration', 'dev', ...(process.env.CI ? ['ci'] : [])];
const manifest: Record<string, unknown> = {};

const [serverPlatform, browserPlatform] = await Promise.all([
    load(serverSuite, 'blong-gateway', 'blong-gateway', intents, manifest),
    load(browserSuite, 'blong-gateway', 'blong-gateway', intents, manifest),
]);
await Promise.all([serverPlatform.start({}), browserPlatform.start({})]);
await tap.test('blong-gateway meter flow (server)', async (test: Test) => {
    await serverPlatform.test(test);
});
await tap.test('blong-gateway meter flow (browser)', async (test: Test) => {
    await browserPlatform.test(test);
});
await Promise.all([serverPlatform.stop(), browserPlatform.stop()]);
