import load from '@feasibleone/blong-gogo';
import tap from 'tap';

import server from './server.ts';

const platform = await load(server, 'int-sql', 'int-sql', ['microservice', 'integration', 'dev']);
await platform.start();
await tap.test('blong int-sql', async test => {
    await platform.test(test);
});
await platform.stop();
