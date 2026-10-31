/**
 * index.test.ts — Tap runner for the `agent` realm.
 *
 * Loads the server platform only: the realm has no browser layer. Every group wired in `index.ts`
 * (`integration.watch.test`) runs through `platform.test`, and the runner exists so the realm can
 * say what it registers before any ticket is claimed.
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

const serverPlatform = await load(serverSuite, 'blong-agent', 'blong-agent', intents, manifest);
await serverPlatform.start({});

await tap.test('agent realm starts', async (test: Test) => {
    const platform = serverPlatform as unknown as {methods?: Map<string, unknown>};
    const names = platform.methods ? Array.from(platform.methods.keys()) : [];
    // The boot lists components, not handlers: the adapter proves the fixture pool is attached and
    // `agent.db` proves the persistence group that the four tables arrive with (`@@D-707`).
    test.ok(names.includes('agent.task'), 'the task adapter is attached');
    test.ok(names.includes('agent.db'), 'the persistence group is attached');
    // Wired groups run through `platform.test`; there are none until Group 6 adds them.
});

await serverPlatform.stop();
