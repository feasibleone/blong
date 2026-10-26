/**
 * index.test.ts — Tap test runner for the `core` realm tests.
 *
 * Loads the server platform and runs the groups wired in `index.ts`
 * (`integration.watch.test`). The realm owns no browser suite: its handlers are
 * storage, not UI.
 *
 * Usage:
 *   node index.test.ts
 */
import load from '@feasibleone/blong-gogo';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import tap, {Test} from 'tap';

import serverSuite from './index.ts';

const intents = ['microservice', 'integration', 'dev', ...(process.env.CI ? ['ci'] : [])];
const manifest: Record<string, unknown> = {};

const serverPlatform = await load(serverSuite, 'blong-core', 'blong-core', intents, manifest);
await serverPlatform.start({});
await tap.test('blong-core translation flow (server)', async (test: Test) => {
    await serverPlatform.test(test);
});
await serverPlatform.stop();
