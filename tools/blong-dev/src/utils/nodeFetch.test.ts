/**
 * The fetch the call command uses for a route whose answer is a person's.
 *
 * The point of this module is the deadline it does *not* have, which cannot be tested by
 * waiting five minutes — so the test proves the two things that would silently break it:
 * a response that arrives slowly still arrives, and the shape is the one the MLE client
 * reads (`ok`, `status`, `json()`, `text()`).
 */

import {createServer, type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {test} from 'tap';

import {nodeFetch} from './nodeFetch.ts';

/** A server that answers after `delayMs`, echoing the method and body it saw. */
function slowServer(answers: Array<{delayMs: number; status?: number; body: string}>): Promise<{
    url: string;
    close: () => Promise<void>;
}> {
    return new Promise(resolve => {
        let index = 0;
        const server: Server = createServer((request, response) => {
            const chunks: Buffer[] = [];
            request.on('data', chunk => chunks.push(chunk as Buffer));
            request.on('end', () => {
                const answer = answers[index] ?? {delayMs: 0, body: '{}'};
                index += 1;
                const payload = JSON.stringify({
                    method: request.method,
                    seen: Buffer.concat(chunks).toString('utf8'),
                    body: answer.body,
                });
                setTimeout(() => {
                    response.writeHead(answer.status ?? 200, {'content-type': 'application/json'});
                    response.end(payload);
                }, answer.delayMs);
            });
        });
        server.listen(0, '127.0.0.1', () => {
            const {port} = server.address() as AddressInfo;
            resolve({
                url: `http://127.0.0.1:${port}`,
                close: () => new Promise(done => server.close(() => done())),
            });
        });
    });
}

test('a slow answer arrives, with the body the caller sent', async t => {
    const server = await slowServer([{delayMs: 1_500, body: '{"ok":true}'}]);
    t.teardown(() => server.close());

    const response = await nodeFetch(`${server.url}/rpc/chat/prompt/ask`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: '{"jsonrpc":"2.0"}',
    });
    t.equal(response.ok, true, 'a second and a half is not a timeout');
    t.equal(response.status, 200);
    t.same(await response.json(), {
        method: 'POST',
        seen: '{"jsonrpc":"2.0"}',
        body: '{"ok":true}',
    });
    t.end();
});

test('a refusal is a response, not a rejection', async t => {
    const server = await slowServer([{delayMs: 0, status: 400, body: 'bad'}]);
    t.teardown(() => server.close());

    const response = await nodeFetch(`${server.url}/rpc/x/y/z`);
    t.equal(response.ok, false, 'the caller reads the status and decides');
    t.equal(response.status, 400);
    t.equal(await response.text(), JSON.stringify({method: 'GET', seen: '', body: 'bad'}));
    t.end();
});

test('a closed port rejects, so a dead gateway is still an error', async t => {
    const server = await slowServer([{delayMs: 0, body: '{}'}]);
    await server.close();
    await t.rejects(nodeFetch(`${server.url}/rpc/x/y/z`), 'fetch failed to connect');
    t.end();
});
