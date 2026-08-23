import load from '@feasibleone/blong-gogo';
import tap from 'tap';

import server from './index.ts';

/**
 * Test bootstrap for the blong-commander suite — loads the `index.ts` suite
 * (blong-server + login + core + access + commander + test layer) and runs the
 * registered test groups under the `integration` intent.
 */
export default async function test(intents: string[] = []) {
    const platform = await load(server, 'commander', 'commander', ['integration'].concat(intents));
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
