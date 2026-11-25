/**
 * A sealed stream over a real socket (`@@D-949`).
 *
 * The interesting failure of a stream is not "does the writer write" — the unit
 * tests cover that — but whether two *different* pieces of code agree on the
 * bytes: the server derives a key from the salt it announces and seals frames
 * with it, the client reads the salt, derives the same key from the other side,
 * and opens them. This file is therefore both a test and the recipe the browser
 * client is written from: fetch, read the salt header, then parse frames out of a
 * byte stream that arrives in chunks that have nothing to do with frame
 * boundaries.
 */
import {deriveStreamKey, newStreamSalt, openFrame, saltToHeader} from '@feasibleone/blong-mle';
import fastify from 'fastify';
import {exportJWK, generateKeyPair} from 'jose';
import {test} from 'tap';

import {
    coalesceStream,
    FLAG_BATCH,
    FLAG_KEEPALIVE,
    FLAG_SEALED,
    nodeSink,
    sealedEncoder,
    STREAM_BINARY_TYPE,
    writeEventStream,
} from './gatewayStream.ts';

/** The info string both sides bind a frame to: the same route name. */
const INFO = 'blong.stream.v1:demo.entry.watch';

/** A reader's side: the salt header, the peer key, and a frame counter. */
async function reader(
    response: Response,
    privateJwk: Record<string, unknown>,
    peerPublicJwk: Record<string, unknown>,
): Promise<AsyncGenerator<unknown>> {
    const salt = response.headers.get('x-blong-stream-salt');
    if (!salt) throw new Error('the server announced no salt, so nothing can be opened');
    const key = await deriveStreamKey({
        privateJwk,
        peerPublicJwk,
        salt: new Uint8Array(Buffer.from(salt, 'base64url')),
        info: INFO,
    });
    const body = response.body as ReadableStream<Uint8Array>;
    return (async function* () {
        const chunks = body.getReader();
        let buffer = new Uint8Array(0);
        let seq = 0;
        for (;;) {
            const {value, done} = await chunks.read();
            if (done) return;
            // Chunks do not respect frames: keep what is incomplete and cut the
            // frames the buffer now holds.
            const merged = new Uint8Array(buffer.length + value.length);
            merged.set(buffer);
            merged.set(value, buffer.length);
            buffer = merged;
            for (;;) {
                if (buffer.length < 4) break;
                const length = new DataView(buffer.buffer, buffer.byteOffset, 4).getUint32(
                    0,
                    false,
                );
                if (buffer.length < 4 + length) break;
                const flags = buffer[4];
                const payload = buffer.subarray(5, 4 + length);
                buffer = buffer.subarray(4 + length);
                if ((flags & FLAG_SEALED) === 0) {
                    yield JSON.parse(new TextDecoder().decode(payload));
                    continue;
                }
                const opened = await openFrame(key, seq++, payload, INFO);
                yield JSON.parse(new TextDecoder().decode(opened));
            }
        }
    })();
}

test('a sealed binary stream opens on the other side', async t => {
    const server = await generateKeyPair('ECDH-ES', {crv: 'P-384', extractable: true});
    const client = await generateKeyPair('ECDH-ES', {crv: 'P-384', extractable: true});
    const serverPrivate = await exportJWK(server.privateKey);
    const clientPrivate = (await exportJWK(client.privateKey)) as unknown as Record<
        string,
        unknown
    >;
    const salt = newStreamSalt();
    const key = await deriveStreamKey({
        privateJwk: serverPrivate,
        peerPublicJwk: await exportJWK(client.publicKey),
        salt,
        info: INFO,
    });

    const app = fastify();
    app.post('/rpc/demo/entry/watch', async (request, reply) => {
        reply.hijack();
        const raw = reply.raw;
        raw.writeHead(200, {
            'content-type': STREAM_BINARY_TYPE,
            'x-blong-stream-salt': saltToHeader(salt),
        });
        // The reader going away is the *response* closing. A request's own
        // `close` fires as soon as its body has been read, which for a POST is
        // before the first frame — listening there aborts every stream at once.
        const controller = new AbortController();
        raw.once('close', () => controller.abort());
        await writeEventStream({
            sink: nodeSink(raw),
            signal: controller.signal,
            encoder: sealedEncoder('binary', key, INFO),
            heartbeat: false,
            iterate: (async function* () {
                yield {last: '01M7Y'};
                yield {last: '01M7Z'};
            })(),
        });
    });
    const address = await app.listen({port: 0, host: '127.0.0.1'});

    const response = await fetch(`${address}/rpc/demo/entry/watch`, {
        method: 'POST',
        headers: {accept: STREAM_BINARY_TYPE, 'content-type': 'application/json'},
        body: JSON.stringify({jsonrpc: '2.0', method: 'demo.entry.watch', id: 1, params: {}}),
    });
    t.equal(response.status, 200, 'the stream opens');
    t.match(
        response.headers.get('content-type') ?? '',
        STREAM_BINARY_TYPE,
        'in the envelope the caller asked for',
    );

    const frames: unknown[] = [];
    for await (const frame of await reader(
        response,
        clientPrivate,
        (await exportJWK(server.publicKey)) as unknown as Record<string, unknown>,
    )) {
        frames.push(frame);
    }
    t.same(frames, [{last: '01M7Y'}, {last: '01M7Z'}], 'both values arrive, in order, opened');
    await app.close();
});

test('a reader that cannot derive the key opens nothing', async t => {
    const server = await generateKeyPair('ECDH-ES', {crv: 'P-384', extractable: true});
    const other = await generateKeyPair('ECDH-ES', {crv: 'P-384', extractable: true});
    const salt = newStreamSalt();
    const key = await deriveStreamKey({
        privateJwk: await exportJWK(server.privateKey),
        peerPublicJwk: await exportJWK(other.publicKey),
        salt,
        info: INFO,
    });
    const frame = await sealedEncoder('binary', key, INFO).encode({last: 'secret'}, 0);
    const payload = (frame as Uint8Array).subarray(5);
    // A third party holds neither private half, so its derived key is not this one.
    const intruder = await generateKeyPair('ECDH-ES', {crv: 'P-384', extractable: true});
    const wrong = await deriveStreamKey({
        privateJwk: await exportJWK(intruder.privateKey),
        peerPublicJwk: await exportJWK(server.publicKey),
        salt,
        info: INFO,
    });
    await t.rejects(openFrame(wrong, 0, payload, INFO), 'the frame does not open');
    t.end();
});

/** A source that yields its values, optionally with a gap between them. */
async function* over(items: unknown[], gapMs = 0): AsyncIterable<unknown> {
    for (const item of items) {
        if (gapMs) await new Promise(resolve => setTimeout(resolve, gapMs));
        yield item;
    }
}

test('a batched stream arrives in order and stops when the reader leaves', async t => {
    const server = await generateKeyPair('ECDH-ES', {crv: 'P-384', extractable: true});
    const client = await generateKeyPair('ECDH-ES', {crv: 'P-384', extractable: true});
    const salt = newStreamSalt();
    const key = await deriveStreamKey({
        privateJwk: await exportJWK(server.privateKey),
        peerPublicJwk: await exportJWK(client.publicKey),
        salt,
        info: INFO,
    });

    let released = false;
    let announce: () => void = () => {};
    const finished = new Promise<void>(resolve => {
        announce = resolve;
    });

    const app = fastify();
    app.post('/rpc/demo/entry/watch', async (_request, reply) => {
        reply.hijack();
        const raw = reply.raw;
        raw.writeHead(200, {
            'content-type': STREAM_BINARY_TYPE,
            'x-blong-stream-salt': saltToHeader(salt),
        });
        const controller = new AbortController();
        raw.once('close', () => controller.abort());
        await writeEventStream({
            sink: nodeSink(raw),
            signal: controller.signal,
            encoder: sealedEncoder('binary', key, INFO),
            heartbeat: false,
            iterate: (async function* () {
                try {
                    yield* coalesceStream(over(['a', 'b']), {maxWaitMs: 50});
                    yield* coalesceStream(over(['c']), {maxWaitMs: 50});
                    // Hold the stream open until the reader leaves: that is the abort under test.
                    await new Promise<void>(resolve => {
                        if (controller.signal.aborted) return resolve();
                        controller.signal.addEventListener('abort', () => resolve(), {once: true});
                    });
                } finally {
                    released = true;
                    announce();
                }
            })(),
        }).catch(() => undefined);
    });
    const address = await app.listen({port: 0, host: '127.0.0.1'});

    const response = await fetch(`${address}/rpc/demo/entry/watch`, {
        method: 'POST',
        headers: {accept: STREAM_BINARY_TYPE, 'content-type': 'application/json'},
        body: JSON.stringify({jsonrpc: '2.0', method: 'demo.entry.watch', id: 1, params: {}}),
    });
    const chunks = (response.body as ReadableStream<Uint8Array>).getReader();
    let buffer = new Uint8Array(0);
    let seq = 0;
    const takeFrame = async (): Promise<{flags: number; value: unknown} | undefined> => {
        for (;;) {
            if (buffer.length >= 4) {
                const length = new DataView(buffer.buffer, buffer.byteOffset, 4).getUint32(
                    0,
                    false,
                );
                if (buffer.length >= 4 + length) {
                    const flags = buffer[4] as number;
                    const payload = buffer.subarray(5, 4 + length);
                    buffer = buffer.subarray(4 + length);
                    if ((flags & FLAG_KEEPALIVE) !== 0) continue;
                    const opened =
                        (flags & FLAG_SEALED) !== 0
                            ? await openFrame(key, seq++, payload, INFO)
                            : payload;
                    return {flags, value: JSON.parse(new TextDecoder().decode(opened))};
                }
            }
            const {value, done} = await chunks.read();
            if (done) return undefined;
            const merged = new Uint8Array(buffer.length + value.length);
            merged.set(buffer);
            merged.set(value, buffer.length);
            buffer = merged;
        }
    };

    const first = await takeFrame();
    t.equal(first?.flags, FLAG_SEALED | FLAG_BATCH, 'the batch is one sealed, flagged frame');
    t.same(first?.value, ['a', 'b'], 'and carries both values in order');
    const second = await takeFrame();
    t.same(second?.value, ['c'], 'the next batch follows it');

    await chunks.cancel();
    const outcome = await Promise.race([
        finished.then(() => 'released'),
        new Promise(resolve => setTimeout(() => resolve('timeout'), 2000)),
    ]);
    t.equal(outcome, 'released', 'a reader that leaves ends the producer');
    t.equal(released, true, 'and the generator ran its finally');
    await app.close();
});
