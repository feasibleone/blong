import load from '@feasibleone/blong';

import browser from './browser.js';
import server from './server.js';

const test = async() => {
    for (const realm of await Promise.all([
        load(server, 'impl', 'impl', ['microservice', 'dev']),
        load(browser, 'impl', 'impl', ['integration', 'dev'])
    ])) await realm.start();
};

test().catch(console.error); // eslint-disable-line no-console
