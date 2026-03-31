import load from '@feasibleone/blong-gogo';
import tap from 'tap';

import server from './server.ts';

const platform = await load(server, 'config-hot-reload', 'config-hot-reload', [
    'microservice',
    'integration',
    'dev',
]);
await platform.start();
await tap.test('config-hot-reload', async test => {
    await platform.test(test);
});
await platform.stop();
