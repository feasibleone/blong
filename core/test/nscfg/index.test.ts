import load from '@feasibleone/blong-gogo';
import tap from 'tap';

import server from './server.ts';

const platform = await load(server, 'nscfg', 'nscfg', ['integration']);
await platform.start();
await tap.test('namespace config', async test => {
    await platform.test(test);
});
await platform.stop();
