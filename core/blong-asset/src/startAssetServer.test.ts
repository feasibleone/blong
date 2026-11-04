import {test, type Test} from 'tap';
import {startAssetServer} from './assetPlugin.ts';

/**
 * The two things the plugin does beyond a request: come up on a port, and answer for a prefix the
 * caller chose. Both are what the `blong-asset` CLI needs, and neither is visible through `inject`.
 */
test('a server starts on the port it is given, and stops', async (t: Test) => {
    const handle = await startAssetServer({
        root: process.cwd(),
        port: 0,
        host: '127.0.0.1',
        logger: false,
    });
    try {
        t.match(
            handle.url,
            /^http:\/\/127\.0\.0\.1:\d+\/s\/$/,
            'the bound port is the one reported',
        );
        const answer = await fetch(new URL('/healthz', handle.url));
        t.equal(answer.status, 200, 'through the real listener rather than inject');
    } finally {
        await handle.close();
    }
    t.end();
});
