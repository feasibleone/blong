import load from '@feasibleone/blong-gogo';
import tap from 'tap';

import server from './server.ts';

const realm = await load(server, 'nscfg', 'nscfg', ['integration']);
await realm.start();
await tap.test('namespace config', async test => {
    await realm.test(test);
});
await realm.stop();
