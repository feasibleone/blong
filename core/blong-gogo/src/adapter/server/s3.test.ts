import {Readable} from 'node:stream';
import {test} from 'tap';

import type {GetObjectCommandOutput} from '@aws-sdk/client-s3';

import {s3BufferAnswer, s3StreamAnswer} from './s3.ts';

/**
 * Reading one object two ways: buffered for the callers that expect bytes, streamed for the one that
 * serves a file.
 *
 * `get` cannot change — `release` and `commander` read a buffer out of it — so a streaming read is a
 * second operation rather than a rewrite of the first. Both answers are shaped by the helpers below,
 * which is what these assertions pin: the same headers, and a body that is a stream rather than the
 * whole object in memory (@@D-838).
 */
function response(size: number): GetObjectCommandOutput {
    const bytes = Buffer.alloc(size, 7);
    // The SDK's body is both a stream and a buffer-able payload; the fake is too, so `get` and
    // `stream` are answered from the same object the way they are in a real answer.
    const body = Object.assign(Readable.from(bytes), {
        transformToByteArray: async () => new Uint8Array(bytes),
    });
    return {
        Body: body as unknown as GetObjectCommandOutput['Body'],
        ContentType: 'video/mp4',
        ContentLength: size,
        ETag: '"abc"',
        Metadata: {key: 'k'},
        LastModified: new Date(0),
        ContentRange: 'bytes 0-1023/4194304',
        AcceptRanges: 'bytes',
    } as unknown as GetObjectCommandOutput;
}

test('a streamed read hands on the bytes without holding them', async t => {
    const answer = s3StreamAnswer(response(4 * 1024 * 1024));
    t.equal(answer.contentLength, 4 * 1024 * 1024, 'the length the object declares');
    t.equal(answer.contentType, 'video/mp4', 'and its type');
    t.equal(answer.contentRange, 'bytes 0-1023/4194304', 'a range answer carries what it sent');
    t.equal(answer.acceptRanges, 'bytes', 'and the object says slices are possible');
    t.ok(answer.body instanceof Readable, 'the body is a stream');
    let seen = 0;
    for await (const chunk of answer.body as AsyncIterable<Buffer>) seen += chunk.length;
    t.equal(seen, 4 * 1024 * 1024, 'and it delivers every byte');
});

test('get still answers a buffer', async t => {
    const answer = await s3BufferAnswer(response(2048));
    t.ok(answer.body, 'there are bytes');
    t.equal(answer.body?.length ?? 0, 2048, 'in one array, of the length the object declares');
    t.equal(answer.contentType, 'video/mp4', 'with the headers it always answered');
    t.end();
});
