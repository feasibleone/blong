import load from '@feasibleone/blong-gogo';
import tap from 'tap';

import server from './server.ts';

const realm = await load(server, 'eip', 'eip', ['microservice', 'dev', 'test', 'integration']);
await realm.start();
await tap.test('blong eip', async test => {
    await realm.test(test);
});
await realm.stop();
