/**
 * index.test.ts — the tap runner for the `viewer` realm.
 *
 * The server platform only: the page is exercised by Playwright
 * (`test/viewer.play.ts`), and what a tap run has to prove is the path a record
 * takes — written by the framework over UDP, reassembled by the adapter, read
 * back through the gateway — which no browser is needed to see.
 *
 * Usage:
 *   node --run ci-test    (via blong-dev test, which uses this file)
 *   node index.test.ts    (direct tap invocation)
 */
import load from '@feasibleone/blong-gogo';
import tap, {Test} from 'tap';

import serverSuite from './index.ts';

const intents = ['microservice', 'integration', 'dev', ...(process.env.CI ? ['ci'] : [])];
const manifest: Record<string, unknown> = {};

const serverPlatform = await load(
    serverSuite,
    'blong-viewer',
    'blong-viewer',
    intents,
    manifest,
);
await serverPlatform.start({});
await tap.test('viewer flow (server)', async (test: Test) => {
    await serverPlatform.test(test);
});
await serverPlatform.stop();
