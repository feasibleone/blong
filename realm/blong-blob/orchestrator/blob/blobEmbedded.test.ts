import {createHash, randomUUID} from 'node:crypto';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable, Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import t from 'tap';

import type {IBlobMeta} from '@feasibleone/blong';

import {
    BLOB_EXTENSIONS,
    blobContentTypeMatches,
    blobContentTypeOf,
    blobExtensionAllowed,
    blobExtensionOf,
} from '../../blob/blobContentTypes.ts';
import {cacheGet, cachePut} from '../../store/storageCache.ts';
import {decryptStream, encryptStream} from '../../store/storageCipher.ts';
import {digestVerify} from '../../store/storageDigest.ts';

const KEY = '130a3f71f4f8560e786ff4c8839fecde6273b94b54ced6efbd0cec5281b4471a';

/** Push `source` through `transform` and collect the answer. */
async function through(transform: Transform, source: Buffer): Promise<Buffer> {
    const out: Buffer[] = [];
    await pipeline(
        Readable.from(source),
        transform,
        async function* (input: AsyncIterable<Buffer>) {
            for await (const chunk of input) out.push(chunk);
        },
    );
    return Buffer.concat(out);
}

/** Read a stream somebody else produced. */
async function drain(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const out: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) out.push(chunk);
    return Buffer.concat(out);
}

/**
 * What `blob.blob.add` writes, and what `blob.blob.get` reads back.
 *
 * The handler is two calls and a record; the part that can be wrong is the composition — the cipher,
 * the digest, the record and the store — so that is what is proven here, at the size a form sends and
 * with the fields the record carries.
 */
t.test('a 64 KiB PNG travels the embedded path unchanged', async t => {
    const directory = mkdtempSync(join(tmpdir(), 'blong-blob-embedded-'));
    const plain = Buffer.alloc(64 * 1024);
    for (let index = 0; index < plain.length; index += 1) plain[index] = (index * 17) % 256;
    const key = randomUUID();
    const extension = blobExtensionOf('photograph.png');
    t.equal(extension, 'png', 'the extension is read from the name');
    t.ok(blobExtensionAllowed(extension), 'and it is one the store takes');
    t.ok(
        blobContentTypeMatches(extension, 'image/png; charset=binary'),
        'a parameter on the content type does not refuse the file',
    );

    const digest = createHash('sha256').update(plain).digest('hex');
    const {crypto, stream} = encryptStream(KEY);
    const ciphertext = await through(stream, plain);
    const meta: IBlobMeta = {
        key,
        namespace: 'party',
        contentType: blobContentTypeOf(extension),
        size: plain.length,
        digest,
        createdAt: new Date(0).toISOString(),
        scopes: ['party:person:1'],
        scopeMode: 'any',
        state: 'stored',
        temporary: false,
        originalFilename: 'photograph.png',
        crypto,
    };
    await cachePut(directory, key, Readable.from(ciphertext), meta);

    const hit = await cacheGet(directory, key);
    t.ok(hit, 'the record is there');
    if (!hit) return;
    const stored = await drain(hit.stream);
    t.notOk(stored.equals(plain), 'what is on disk is not the plaintext');
    const back = await through(decryptStream(KEY, crypto), stored);
    t.ok(back.equals(plain), 'the 64 KiB come back byte-identical');
    await t.resolves(
        through(digestVerify(digest), back).then(() => undefined),
        'and they match the digest the record kept',
    );
});

t.test('the table refuses what it does not know and mismatches what it does', async t => {
    t.notOk(blobExtensionAllowed('exe'), 'an executable is not in the table');
    t.notOk(blobContentTypeMatches('pdf', 'text/plain'), 'a .pdf cannot be plain text');
    t.ok(blobContentTypeMatches('pdf', 'application/pdf'), 'and its own type is accepted');
    t.ok(blobContentTypeMatches('xml', 'text/xml'), 'an alternative type is accepted too');
    for (const extension of ['bin', 'mp4', 'mp3', 'yaml', 'json', 'xlsx']) {
        t.ok(BLOB_EXTENSIONS.includes(extension), `${extension} is accepted out of the box`);
    }
});
