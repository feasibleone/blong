import load from '@feasibleone/blong';

import browser from './browser.js';
import server from './server.js';

const realms = await Promise.all([
    load(server, 'impl', 'impl', ['microservice', 'dev']),
    load(browser, 'impl', 'impl', ['integration', 'dev'])
]);
for (const realm of realms) await realm.start();
for (const realm of realms) await realm.test();
