import load from '@feasibleone/blong-gogo';
import tap from 'tap';

import server from './server.ts';

const platform = await load(server, 'int-adapter', 'int-adapter', ['integration']);
await platform.start({});
await tap.test('blong int-adapter', async test => {
    await platform.test(test);
});
await platform.stop();
