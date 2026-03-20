import load from '@feasibleone/blong-gogo';
import tap from 'tap';

import server from './server.ts';

const platform = await load(server, 'sim-tcp', 'sim-tcp', ['microservice', 'integration', 'dev']);
await platform.start();
await tap.test('blong sim-tcp', async test => {
    await platform.test(test);
});
await platform.stop();
