import load from '@feasibleone/blong-gogo';
import tap from 'tap';

import browser from './browser.ts';
import server from './server.ts';

const platforms = await Promise.all([
    load(server, 'impl', 'impl', ['microservice', 'dev', 'test', 'integration']),
    load(browser, 'impl', 'impl', ['microservice', 'dev', 'test', 'integration']),
]);
for (const platform of platforms) await platform.start();
await tap.test('blong test', async test => {
    await platforms[1].test();
});
for (const platform of platforms) await platform.stop();
