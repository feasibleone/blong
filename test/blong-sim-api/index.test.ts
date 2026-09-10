import load from '@feasibleone/blong-gogo';
import tap from 'tap';

import server from './server.ts';

const platform = await load(server, 'sim-api', 'sim-api', ['microservice', 'integration', 'dev']);
await platform.start({});
await tap.test('blong sim-api', async test => {
    await platform.test(test);
});
await platform.stop();
