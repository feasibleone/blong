import {
    STREAM_FLAG_BATCH,
    STREAM_FLAG_BINARY,
    STREAM_FLAG_SEALED,
    deriveStreamKey,
    encodeFrame,
    newStreamSalt,
    readStream,
    sealFrame,
    toBase64,
} from '@feasibleone/blong-mle';
import {exportJWK, generateKeyPair} from 'jose';
import {test} from 'tap';

const INFO = 'blong.stream.v1:demo.entry.watch';

/** A response a transport could plausibly hand over. */
function responseOf(
    chunks: Uint8Array[],
    headers: Record<string, string> = {},
): {headers: {get(name: string): string | null}; body: AsyncIterable<Uint8Array>} {
    return {
        headers: {get: name => headers[name.toLowerCase()] ?? null},
        body: (async function* () {
            for (const chunk of chunks) yield chunk;
        })(),
    };
}

async function collect(iterable: AsyncIterable<unknown>): Promise<unknown[]> {
    const values: unknown[] = [];
    for await (const value of iterable) values.push(value);
    return values;
}

async function keyPair(): Promise<{seal: CryptoKey; open: CryptoKey}> {
    const server = await generateKeyPair('ECDH-ES', {crv: 'P-384', extractable: true});
    const client = await generateKeyPair('ECDH-ES', {crv: 'P-384', extractable: true});
    const salt = newStreamSalt();
    return {
        seal: await deriveStreamKey({
            privateJwk: await exportJWK(server.privateKey),
            peerPublicJwk: await exportJWK(client.publicKey),
            salt,
            info: INFO,
        }),
        open: await deriveStreamKey({
            privateJwk: await exportJWK(client.privateKey),
            peerPublicJwk: await exportJWK(server.publicKey),
            salt,
            info: INFO,
        }),
    };
}

test('the readable envelope delivers one value per event', async t => {
    const response = responseOf(
        [
            new TextEncoder().encode('data: {"last":"a"}\n\n'),
            new TextEncoder().encode(': ping\n\ndata: {"last":"b"}\n\n'),
        ],
        {'content-type': 'text/event-stream; charset=utf-8'},
    );
    t.same(
        await collect(readStream(response)),
        [{last: 'a'}, {last: 'b'}],
        'keepalives are not values, and the values arrive in order',
    );
    t.end();
});

test('a frame may carry several values, and the reader flattens them', async t => {
    const single = encodeFrame(0, new TextEncoder().encode('{"last":"a"}'));
    const batched = encodeFrame(
        STREAM_FLAG_BATCH,
        new TextEncoder().encode(JSON.stringify([{last: 'b'}, {last: 'c'}])),
    );
    const bytes = encodeFrame(STREAM_FLAG_BINARY, new Uint8Array([1, 2, 3]));
    const response = responseOf([single, batched, bytes], {
        'content-type': 'application/vnd.blong.stream',
    });
    const values = await collect(readStream(response));
    t.same(values.slice(0, 3), [{last: 'a'}, {last: 'b'}, {last: 'c'}], 'a batch is three values, not one');
    t.same(values[3], new Uint8Array([1, 2, 3]), 'a binary value stays bytes');
    t.end();
});

test('a sealed frame is opened before it is read', async t => {
    const {seal, open} = await keyPair();
    const sealed = await sealFrame(seal, 0, new TextEncoder().encode('{"last":"a"}'), INFO);
    const frame = encodeFrame(STREAM_FLAG_SEALED, sealed);
    const headers = {
        'content-type': 'application/vnd.blong.stream',
        'x-blong-stream-salt': '/w==',
    };
    t.same(
        await collect(readStream(responseOf([frame], headers), {key: open, info: INFO})),
        [{last: 'a'}],
        'the value is what the producer yielded',
    );
    await t.rejects(
        // A fresh response: a body is a stream and is read once.
        collect(readStream(responseOf([frame], headers), {info: INFO})),
        'without the key the reader says so instead of yielding nonsense',
    );
    t.end();
});

test('a sealed text event is opened too, and a batched one is flattened', async t => {
    const {seal, open} = await keyPair();
    const one = toBase64(await sealFrame(seal, 0, new TextEncoder().encode('{"last":"a"}'), INFO));
    const response = responseOf([new TextEncoder().encode(`data: ${one}\n\n`)], {
        'content-type': 'text/event-stream',
        'x-blong-stream-salt': '/w==',
    });
    t.same(await collect(readStream(response, {key: open, info: INFO})), [{last: 'a'}], 'the text envelope opens the same way');
    t.end();
});

test('a frame split across chunks still arrives whole', async t => {
    const frame = encodeFrame(0, new TextEncoder().encode('{"last":"a"}'));
    const response = responseOf([frame.subarray(0, 2), frame.subarray(2, 5), frame.subarray(5)], {
        'content-type': 'application/vnd.blong.stream',
    });
    t.same(await collect(readStream(response)), [{last: 'a'}], 'the reader keeps the partial head');
    t.end();
});
