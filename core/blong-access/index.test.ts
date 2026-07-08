/**
 * index.test.ts — Tap test runner for blong-access integration tests.
 *
 * Loads the full suite (blong-server + blong-login + blong-core + blong-access)
 * against the `blong-integration` MySQL database, then runs the
 * testLoginTokenCreate test via the existing `access` orchestrator
 * and `db` adapter from blong-server.
 *
 * Usage:
 *   node --run ci-test    (via blong-dev test, which uses this file)
 *   node index.test.ts    (direct tap invocation)
 */
import load from '@feasibleone/blong-gogo';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import tap, {Test} from 'tap';

import server from './index.ts';

const platform = await load(server, 'blong-access', 'blong-access', [
    'microservice',
    'integration',
    'dev',
    ...(process.env.CI ? ['ci'] : []),
]);
await platform.start({});
await tap.test('blong-access login flow', async (test: Test) => {
    await platform.test(test);
});
await platform.stop();
