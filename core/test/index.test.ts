import load from '@feasibleone/blong';
import tap from 'tap';

import browser from './browser.js';
import server from './server.js';

const realms = await Promise.all([
    load(server, 'impl', 'impl', ['microservice', 'dev', 'test', 'integration']),
    load(browser, 'impl', 'impl', ['microservice', 'dev', 'test', 'integration']),
]);
for (const realm of realms) await realm.start();
await realms[1].test(tap);
for (const realm of realms) await realm.stop();
