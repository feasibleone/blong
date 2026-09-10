import load from '@feasibleone/blong-gogo';
import tap from 'tap';

import browser from './browser.ts';
import server from './server.ts';
const manifest: Record<string, unknown> = {};
export default async function test(intents: string[] = [], config: string | object = 'impl') {
    const platforms = await Promise.all([
        load(
            server,
            'impl',
            config,
            ['microservice', 'integration', 'dev'].concat(intents),
            manifest,
        ),
        load(
            browser,
            'impl',
            config,
            ['microservice', 'integration', 'dev'].concat(intents),
            manifest,
        ),
    ]);
    for (const platform of platforms) await platform.start({});
    await tap.test('blong test', async () => {
        await platforms[1].test();
    });
    for (const platform of platforms) await platform.stop();
}

if (import.meta.main) {
    test().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
