import load from '@feasibleone/blong-gogo';
import tap from 'tap';

import server from './server.ts';

export default async function test(
    intents: string[] = [],
    config: string | object = 'int-adapter',
) {
    const platform = await load(server, 'int-adapter', config, ['integration'].concat(intents));
    await platform.start({});
    await tap.test('blong int-adapter', async test => {
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
