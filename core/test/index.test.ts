import load from '@feasibleone/blong';
import tap from 'tap';

import browser from './browser.js';
import server from './server.js';

const realms = await Promise.all([
    load(server, 'impl', 'impl', ['microservice', 'dev', 'test']),
    load(browser, 'impl', 'impl', ['integration', 'dev', 'test']),
]);
for (const realm of realms) await realm.start();
for (const realm of realms) await realm.test(tap);
for (const realm of realms) await realm.stop();
