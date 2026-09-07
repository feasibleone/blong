import load from '@feasibleone/blong-gogo';
import tap from 'tap';

import server from './index.ts';

/**
 * Test bootstrap for the blong-commander suite — loads the `index.ts` suite
 * (blong-server + login + core + access + commander + test layer) and runs the
 * registered test groups.
 *
 * Loaded under `microservice + integration + dev` so the shared `srv.db`
 * adapter auto-creates the suite database, syncs the schema and applies the
 * `meta/db` + `meta/dbTest` seeds (the `access-db` commander source lists
 * tables from that database). Mirrors the blong-access test bootstrap.
 */
export default async function test(intents: string[] = []) {
    const platform = await load(
        server,
        'commander',
        'commander',
        ['microservice', 'integration', 'dev', ...(process.env.CI ? ['ci'] : [])].concat(intents),
    );
    await platform.start({});
    await tap.test('blong-commander', async test => {
        await platform.test(test);
    });
    await platform.stop();
}

if (import.meta.main) {
    test().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
