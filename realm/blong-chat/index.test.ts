/**
 * index.test.ts — Tap runner for the `chat` realm.
 *
 * Loads the server platform only: the realm has no browser layer, so there is no second platform and
 * no Playwright project. The port exists so the realm can say what it registers before any protocol
 * work starts, and every group wired in `index.ts` (`integration.watch.test`) runs through
 * `platform.test`.
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

const serverPlatform = await load(serverSuite, 'blong-chat', 'blong-chat', intents, manifest);
await serverPlatform.start({});

await tap.test('chat realm starts', async (test: Test) => {
    const methods = (serverPlatform as unknown as {methods?: Map<string, unknown>}).methods;
    test.ok(methods && methods.size > 0, 'the chat dispatch port is registered');
    await serverPlatform.test(test);
});

await serverPlatform.stop();
