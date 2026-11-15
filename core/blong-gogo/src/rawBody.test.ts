import fastify from 'fastify';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {test} from 'tap';

import {limitBytes, registerRawBody} from './rawBody.ts';

const payload = (size: number) => Buffer.alloc(size, 1);

test('a raw body reaches the handler as a stream', async t => {
    const app = fastify();
    registerRawBody(app);
    app.post('/stream', async request => {
        let size = 0;
        for await (const chunk of request.body as AsyncIterable<Buffer>) size += chunk.length;
        return {size};
    });

    const answer = await app.inject({
        method: 'POST',
        url: '/stream',
        headers: {'content-type': 'application/octet-stream'},
        payload: payload(8 * 1024 * 1024),
    });
    t.equal(answer.statusCode, 200, 'eight megabytes arrive');
    t.same(answer.json(), {size: 8 * 1024 * 1024}, 'and every byte is counted');
    await app.close();
});

test('without the parser the content type is refused outright', async t => {
    const app = fastify();
    app.post('/stream', async () => ({ok: true}));
    const answer = await app.inject({
        method: 'POST',
        url: '/stream',
        headers: {'content-type': 'application/octet-stream'},
        payload: payload(1024),
    });
    t.equal(
        answer.statusCode,
        415,
        'an unparsed content type is 415, which is why a parser is needed',
    );
    await app.close();
});

/**
 * The rule the gateway relies on: a parser added inside a plugin reaches that plugin's routes and no
 * others (`@@D-860`).
 *
 * This is a property of fastify rather than of this file, which is exactly why it is pinned here — a
 * gateway that mounted a streaming route at the root would accept `image/png` on every route of the
 * process, and nothing in a unit test would notice.
 */
test('a parser in an encapsulated context does not leak', async t => {
    const app = fastify();
    app.post('/json', async () => ({ok: true}));
    await app.register(async instance => {
        registerRawBody(instance);
        instance.put('/upload', async request => {
            let size = 0;
            for await (const chunk of request.body as AsyncIterable<Buffer>) size += chunk.length;
            return {size};
        });
    });

    const uploaded = await app.inject({
        method: 'PUT',
        url: '/upload',
        headers: {'content-type': 'image/png'},
        payload: payload(2048),
    });
    t.equal(uploaded.statusCode, 200, "the route that asked for it takes the stream");
    t.same(uploaded.json(), {size: 2048}, 'and every byte arrives');

    const elsewhere = await app.inject({
        method: 'POST',
        url: '/json',
        headers: {'content-type': 'image/png'},
        payload: payload(2048),
    });
    t.equal(
        elsewhere.statusCode,
        415,
        'a route beside it still refuses a body it has no parser for',
    );
    await app.close();
});

test('a stream parser ignores the route bodyLimit, so the handler counts', async t => {
    const app = fastify();
    registerRawBody(app);
    // `bodyLimit` is declared here to make the point: it does not apply to a stream parser, and the
    // route that relies on it alone accepts any size (@@F-730).
    app.post('/capped', {bodyLimit: 1024 * 1024}, async (request, reply) => {
        let size = 0;
        for await (const chunk of request.body as AsyncIterable<Buffer>) {
            size += chunk.length;
            if (size > 1024 * 1024) return reply.code(413).send({message: 'too large'});
        }
        return {size};
    });

    const small = await app.inject({
        method: 'POST',
        url: '/capped',
        headers: {'content-type': 'application/octet-stream'},
        payload: payload(512 * 1024),
    });
    t.equal(small.statusCode, 200, 'half a megabyte passes');

    const big = await app.inject({
        method: 'POST',
        url: '/capped',
        headers: {'content-type': 'application/octet-stream'},
        payload: payload(2 * 1024 * 1024),
    });
    t.equal(big.statusCode, 413, 'two megabytes are refused by the counter');
    await app.close();
});

test('limitBytes refuses a stream that passes its ceiling', async t => {
    const small = await pipeline(
        Readable.from(payload(512 * 1024)),
        limitBytes(1024 * 1024),
        async source => {
            let size = 0;
            for await (const chunk of source) size += (chunk as Buffer).length;
            return size;
        },
    );
    t.equal(small, 512 * 1024, 'what fits passes through');

    const caught = await pipeline(
        Readable.from(payload(2 * 1024 * 1024)),
        limitBytes(1024 * 1024),
        async () => undefined,
    ).catch((error: {statusCode?: number}) => error);
    t.equal((caught as {statusCode?: number}).statusCode, 413, 'what does not is a 413');
});
