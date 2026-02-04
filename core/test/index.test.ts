import load from '@feasibleone/blong-gogo';
import tap from 'tap';

import browser from './browser.ts';
import server from './server.ts';

const realms = await Promise.all([
    load(server, 'impl', 'impl', ['microservice', 'dev', 'test', 'integration']),
    load(browser, 'impl', 'impl', ['microservice', 'dev', 'test', 'integration']),
]);
for (const realm of realms) await realm.start();
await tap.test('blong test', async test => {
    await realms[1].test();
});
for (const realm of realms) await realm.stop();
