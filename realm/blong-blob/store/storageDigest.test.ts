import t from 'tap';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

import {digestTap, digestVerify} from './storageDigest.ts';

const sha256 = (value: Buffer) => createHash('sha256').update(value).digest('hex');

t.test('the tap reports the digest of what passed through it', async t => {
    for (const size of [1, 16, 1024 * 1024]) {
        const content = Buffer.alloc(size, 7);
        const tap = digestTap();
        const out: Buffer[] = [];
        await pipeline(
            Readable.from(content),
            tap.stream,
            async function* (source: AsyncIterable<Buffer>) {
                for await (const chunk of source) out.push(chunk);
            },
        );
        t.equal(await tap.result, sha256(content), `the digest of ${size} bytes is SHA-256`);
        t.ok(Buffer.concat(out).equals(content), `and all ${size} bytes came out`);
    }
});

t.test('a stream whose bytes match its digest passes', async t => {
    const content = Buffer.from('the bytes a record promised');
    await t.resolves(
        pipeline(Readable.from(content), digestVerify(sha256(content)), async () => undefined),
        'the check completes',
    );
});

t.test('a flipped byte is a refusal, not a wrong file', async t => {
    const content = Buffer.from('the bytes a record promised');
    const expected = sha256(content);
    const flipped = Buffer.from(content);
    flipped[0] ^= 1;
    const caught = await pipeline(
        Readable.from(flipped),
        digestVerify(expected),
        async () => undefined,
    ).catch((error: {type?: string}) => error);
    t.equal((caught as {type?: string})?.type, 'blob.corrupt', 'the stream fails with blob.corrupt');
});

t.test('a record with no digest is refused rather than trusted', async t => {
    const caught = await pipeline(
        Readable.from(Buffer.from('x')),
        digestVerify(''),
        async () => undefined,
    ).catch((error: {type?: string}) => error);
    t.equal((caught as {type?: string})?.type, 'blob.corrupt', 'an empty digest is not a check that passes');
});
