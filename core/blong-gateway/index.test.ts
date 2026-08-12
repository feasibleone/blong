/**
 * index.test.ts — Tap test runner for blong-gateway integration tests.
 *
 * Loads the server platform (srv + login + core + access + gateway) and runs
 * the metering test group against real MySQL + Redis.
 *
 * Usage:
 *   node --run ci-test    (via blong-dev test, which uses this file)
 *   node index.test.ts    (direct tap invocation)
 */
import load from '@feasibleone/blong-gogo';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import tap, {Test} from 'tap';

import serverSuite from './index.ts';

const intents = ['microservice', 'integration', 'dev', ...(process.env.CI ? ['ci'] : [])];
const manifest: Record<string, unknown> = {};

const serverPlatform = await load(serverSuite, 'blong-gateway', 'blong-gateway', intents, manifest);
await serverPlatform.start({});
await tap.test('blong-gateway meter flow', async (test: Test) => {
    await serverPlatform.test(test);
});
await serverPlatform.stop();
