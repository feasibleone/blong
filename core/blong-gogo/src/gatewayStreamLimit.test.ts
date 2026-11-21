import {
    STREAM_MAX_FRAME_BYTES,
    StreamFrameTooLarge,
    encodeFrame,
    frameDecoder,
} from '@feasibleone/blong-mle';
import {test} from 'tap';

import {frameByteLength, plainEncoder, writeEventStream, type IFrameSink} from './gatewayStream.ts';

/** A sink that keeps whatever was written. */
function sinkOf(): IFrameSink & {frames: (string | Uint8Array)[]; ended: boolean} {
    const frames: (string | Uint8Array)[] = [];
    const state = {ended: false};
    return {
        frames,
        get ended() {
            return state.ended;
        },
        write(frame: string | Uint8Array): boolean {
            frames.push(frame);
            return true;
        },
        drained: async () => {},
        end: () => {
            state.ended = true;
        },
    };
}

test('a reader refuses a length it will not wait for, before the frame arrives', t => {
    const decoder = frameDecoder({maxFrameBytes: 1024});
    // The prefix alone announces 4 GiB and nothing follows it: this is the shape
    // of the attack, and the refusal has to happen on the prefix.
    const prefix = new Uint8Array(4);
    new DataView(prefix.buffer).setUint32(0, 0xffffffff, false);
    t.throws(
        () => decoder.push(prefix),
        {
            name: 'StreamFrameTooLarge',
            type: 'stream.frameTooLarge',
            statusCode: 413,
            declared: 0xffffffff,
        },
        'the announced length is refused rather than buffered against',
    );
    t.end();
});

test('a reader keeps a frame split across chunks and rejects nothing it should not', t => {
    const decoder = frameDecoder({maxFrameBytes: 1024});
    const frame = encodeFrame(2, new TextEncoder().encode('{"a":1}'));
    t.same(decoder.push(frame.subarray(0, 3)), [], 'a partial prefix completes nothing');
    t.same(decoder.push(frame.subarray(3, 6)), [], 'a partial payload completes nothing');
    const frames = decoder.push(frame.subarray(6));
    t.equal(frames.length, 1, 'the frame completes when its last byte arrives');
    t.equal(frames[0].flags, 2, 'with the flags it was written with');
    t.equal(
        new TextDecoder().decode(frames[0].payload),
        '{"a":1}',
        'and the payload it carried',
    );
    t.end();
});

test('the cap holds a frame that is exactly at the limit and refuses one past it', t => {
    const decoder = frameDecoder({maxFrameBytes: 16});
    t.equal(decoder.push(encodeFrame(0, new Uint8Array(15))).length, 1, 'the limit itself is sent');
    const over = new Uint8Array(4);
    new DataView(over.buffer).setUint32(0, 17, false);
    t.throws(() => decoder.push(over), StreamFrameTooLarge, 'one byte more is refused');
    t.end();
});

test('a producer whose frame is too large ends the stream with the reason', async t => {
    const sink = sinkOf();
    await writeEventStream({
        sink,
        iterate: (async function* () {
            yield {ok: true};
            yield {big: 'x'.repeat(200)};
        })(),
        signal: new AbortController().signal,
        encoder: plainEncoder('text'),
        heartbeat: false,
        maxFrameBytes: 100,
    });
    t.equal(sink.frames.length, 2, 'the frame that fitted was sent, and the failure replaced the rest');
    t.match(String(sink.frames[1]), /stream\.frameTooLarge/, 'the reader is told why the stream ended');
    t.ok(sink.ended, 'and it ended');
});

test('the size a frame is judged by is the payload, whichever envelope carries it', t => {
    t.equal(frameByteLength(new Uint8Array(13)), 13, 'a binary frame counts its bytes');
    t.equal(frameByteLength('data: abc\n\n'), 3, 'a text frame counts the payload, not the markers');
    t.end();
});

test('the default cap is the gateway body ceiling, not a number nobody chose', t => {
    t.equal(STREAM_MAX_FRAME_BYTES, 1 << 20, 'one mebibyte, like fastify without a bodyLimit');
    t.end();
});
