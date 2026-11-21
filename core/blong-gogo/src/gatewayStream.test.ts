import {deriveStreamKey, newStreamSalt, openFrame} from '@feasibleone/blong-mle';
import {exportJWK, generateKeyPair} from 'jose';
import {test} from 'tap';

import {
    binaryFrame,
    envelopeOf,
    FLAG_BINARY,
    FLAG_SEALED,
    payloadOf,
    plainEncoder,
    sealedEncoder,
    STREAM_BINARY_TYPE,
    STREAM_TEXT_TYPE,
    writeEventStream,
    type IFrameSink,
} from './gatewayStream.ts';

/** A sink that records what was written, and can be told to refuse room. */
function sinkOf({room = true}: {room?: boolean} = {}): IFrameSink & {
    frames: (string | Uint8Array)[];
    ended: boolean;
    release: () => void;
} {
    const frames: (string | Uint8Array)[] = [];
    let release: () => void = () => {};
    const state = {ended: false};
    return {
        frames,
        get ended() {
            return state.ended;
        },
        release: () => release(),
        write(frame: string | Uint8Array): boolean {
            frames.push(frame);
            return room;
        },
        async drained(signal: AbortSignal): Promise<void> {
            if (signal.aborted) return;
            await Promise.race([
                new Promise<void>(resolve => {
                    release = resolve;
                }),
                new Promise<void>(resolve =>
                    signal.addEventListener('abort', () => resolve(), {once: true}),
                ),
            ]);
        },
        end(): void {
            state.ended = true;
        },
    };
}

async function* valuesOf(...values: unknown[]): AsyncIterable<unknown> {
    for (const value of values) yield value;
}

/** A stable pair each side derives the same key from. */
async function pairOf(): Promise<{
    a: CryptoKey;
    b: CryptoKey;
}> {
    const left = await generateKeyPair('ECDH-ES', {crv: 'P-384', extractable: true});
    const right = await generateKeyPair('ECDH-ES', {crv: 'P-384', extractable: true});
    const salt = newStreamSalt();
    const info = 'blong.stream.v1:test.entry.watch';
    return {
        a: await deriveStreamKey({
            privateJwk: await exportJWK(left.privateKey),
            peerPublicJwk: await exportJWK(right.publicKey),
            salt,
            info,
        }),
        b: await deriveStreamKey({
            privateJwk: await exportJWK(right.privateKey),
            peerPublicJwk: await exportJWK(left.publicKey),
            salt,
            info,
        }),
    };
}

test('the envelope is what the caller asked for, and nothing is assumed', t => {
    t.equal(envelopeOf(`${STREAM_TEXT_TYPE}`), 'text', 'the readable one is named');
    t.equal(
        envelopeOf(`text/html, ${STREAM_BINARY_TYPE};q=0.9`),
        'binary',
        'a binary request is honoured wherever it appears in the list',
    );
    t.equal(
        envelopeOf(`${STREAM_TEXT_TYPE}, ${STREAM_BINARY_TYPE}`),
        'text',
        'naming both answers the one a person can read',
    );
    t.equal(envelopeOf('application/json'), undefined, 'an ordinary call asks for no stream');
    t.equal(envelopeOf('*/*'), undefined, 'and neither does curl, which asks for anything');
    t.equal(envelopeOf(undefined), undefined, 'a request with no Accept is not a stream');
    t.end();
});

test('each value leaves as one frame, in the order produced', async t => {
    const sink = sinkOf();
    await writeEventStream({
        sink,
        iterate: valuesOf({id: 'a'}, {id: 'b'}),
        signal: new AbortController().signal,
        encoder: plainEncoder('text'),
        heartbeat: false,
    });
    t.same(sink.frames, ['data: {"id":"a"}\n\n', 'data: {"id":"b"}\n\n'], 'two values, two frames');
    t.ok(sink.ended, 'the response is ended when the producer is done');
});

test('a payload with a newline keeps one data line per line', async t => {
    const sink = sinkOf();
    await writeEventStream({
        sink,
        iterate: valuesOf('first\nsecond'),
        signal: new AbortController().signal,
        encoder: plainEncoder('text'),
        heartbeat: false,
    });
    t.equal(
        sink.frames[0],
        'data: first\ndata: second\n\n',
        'a raw newline would have ended the frame early',
    );
});

test('the binary envelope carries bytes the readable one could not', async t => {
    const sink = sinkOf();
    const bytes = new Uint8Array([0, 1, 2, 255, 10]);
    await writeEventStream({
        sink,
        iterate: valuesOf(bytes),
        signal: new AbortController().signal,
        encoder: plainEncoder('binary'),
        heartbeat: false,
    });
    const frame = sink.frames[0] as Uint8Array;
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    t.equal(view.getUint32(0, false), frame.length - 4, 'the length delimits the frame');
    t.equal(frame[4], FLAG_BINARY, 'and the flag says the payload is not JSON');
    t.same(
        Array.from(payloadOf(bytes).bytes),
        [0, 1, 2, 255, 10],
        'the payload is what the producer yielded, unchanged',
    );
});

test('a sealed frame opens with the key the other side derived', async t => {
    const {a, b} = await pairOf();
    const info = 'blong.stream.v1:test.entry.watch';
    const sink = sinkOf();
    await writeEventStream({
        sink,
        iterate: valuesOf({last: '01M'}),
        signal: new AbortController().signal,
        encoder: sealedEncoder('binary', a, info),
        heartbeat: false,
    });
    const frame = sink.frames[0] as Uint8Array;
    t.equal(frame[4], FLAG_SEALED, 'the flag says the frame is sealed');
    const opened = await openFrame(b, 0, frame.subarray(5), info);
    t.equal(
        new TextDecoder().decode(opened),
        '{"last":"01M"}',
        'the reader rebuilds the value from what it can open',
    );
    t.not(
        Buffer.from(frame).toString('utf8').includes('01M'),
        true,
        'and the value is not readable on the wire',
    );
});

test('a producer that throws is one error frame', async t => {
    const sink = sinkOf();
    await writeEventStream({
        sink,
        iterate: (async function* () {
            yield {id: 'a'};
            throw Object.assign(new Error('the store went away'), {
                type: 'viewer.storeGone',
                statusCode: 503,
            });
        })(),
        signal: new AbortController().signal,
        encoder: plainEncoder('text'),
        heartbeat: false,
    });
    t.same(
        sink.frames[1],
        'data: {"error":{"message":"the store went away","type":"viewer.storeGone","statusCode":503}}\n\n',
        'the frames before it stay readable, and the failure is named on its own',
    );
    t.ok(sink.ended, 'and the stream still ends');
});

test('a full sink is waited for rather than queued against', async t => {
    const sink = sinkOf({room: false});
    let produced = 0;
    const writing = writeEventStream({
        sink,
        iterate: (async function* () {
            produced++;
            yield {id: 'a'};
            produced++;
            yield {id: 'b'};
        })(),
        signal: new AbortController().signal,
        encoder: plainEncoder('text'),
        heartbeat: false,
    });
    await new Promise(resolve => setTimeout(resolve, 20));
    t.equal(produced, 1, 'the producer is not pulled again while the sink is full');
    sink.release();
    await new Promise(resolve => setTimeout(resolve, 20));
    sink.release();
    await writing;
    t.equal(produced, 2, 'and both values arrive once there is room');
});

test('a reader that leaves stops the producer', async t => {
    const sink = sinkOf();
    const controller = new AbortController();
    let produced = 0;
    await writeEventStream({
        sink,
        iterate: (async function* () {
            produced++;
            yield {id: 'a'};
            controller.abort();
            produced++;
            yield {id: 'b'};
        })(),
        signal: controller.signal,
        encoder: plainEncoder('text'),
        heartbeat: false,
    });
    t.equal(produced, 2, 'the value already produced is yielded');
    t.equal(sink.frames.length, 1, 'but nothing is written after the reader left');
    t.ok(sink.ended, 'and the response is closed');
});

test('the frame format is the format, not the caller', t => {
    t.equal(
        new TextDecoder().decode(payloadOf('plain').bytes),
        'plain',
        'a string is its own payload',
    );
    t.equal(
        new TextDecoder().decode(payloadOf(undefined).bytes),
        'null',
        'an absent value is still a frame',
    );
    const frame = binaryFrame(0, new TextEncoder().encode('{"a":1}'));
    t.equal(
        new DataView(frame.buffer).getUint32(0, false),
        frame.length - 4,
        'a frame counts itself',
    );
    t.end();
});
