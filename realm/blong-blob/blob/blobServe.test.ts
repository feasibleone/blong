import {createHash} from 'node:crypto';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable, Transform} from 'node:stream';
import t from 'tap';

import type {IBlobMeta} from '@feasibleone/blong';

import {storageMetaFromEntry} from '../adapter/storage/storageLib.ts';
import {cacheGet, cacheHead, cachePut} from '../store/storageCache.ts';
import {decryptStream, encryptStream} from '../store/storageCipher.ts';
import {digestVerify} from '../store/storageDigest.ts';
import {blobContentRange, blobRangeParse} from './blobRange.ts';
import {blobScopeSign, blobScopeVerify} from './blobScope.ts';
import {blobServe} from './blobServe.ts';

const KEY = '130a3f71f4f8560e786ff4c8839fecde6273b94b54ced6efbd0cec5281b4471a';
const SECRET = 'a-cookie-secret';

async function drain(stream: Readable | Transform): Promise<Buffer> {
    const out: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) out.push(chunk);
    return Buffer.concat(out);
}

async function storeOf(content: Buffer, meta: Partial<IBlobMeta>) {
    const directory = mkdtempSync(join(tmpdir(), 'blong-blob-serve-'));
    const {crypto, stream} = encryptStream(KEY);
    const ciphertext = await drain(Readable.from(content).pipe(stream) as unknown as Readable);
    const full: IBlobMeta = {
        key: 'k',
        namespace: 'party',
        contentType: 'video/mp4',
        size: content.length,
        digest: createHash('sha256').update(content).digest('hex'),
        createdAt: new Date(0).toISOString(),
        scopes: ['anonymous'],
        scopeMode: 'any',
        state: 'stored',
        temporary: false,
        cacheControl: 'private, max-age=60',
        crypto,
        ...meta,
    };
    await cachePut(`${directory}/party`, 'k', Readable.from(ciphertext), full);
    return {
        head: async () => (await cacheHeadOf(directory)) ?? null,
        get: async () => {
            const hit = await cacheGet(`${directory}/party`, 'k');
            return hit ? {meta: full, stream: hit.stream as Readable} : null;
        },
    };
}

async function cacheHeadOf(directory: string) {
    const entry = await cacheHead(`${directory}/party`, 'k');
    return entry ? storageMetaFromEntry('party', entry) : undefined;
}

const services = (store: {
    head: () => Promise<IBlobMeta | null>;
    get: () => Promise<{meta: IBlobMeta; stream: Readable} | null>;
}) => ({
    head: store.head,
    get: store.get,
    decrypt: (crypto: NonNullable<IBlobMeta['crypto']>) => decryptStream(KEY, crypto),
    verify: (digest: string) => digestVerify(digest),
});

t.test('an inline read answers the headers and the bytes', async t => {
    const content = Buffer.alloc(2048, 4);
    const store = await storeOf(content, {});
    const answer = await blobServe({namespace: 'party', key: 'k'}, services(store));
    t.equal(answer.code, 200, 'a whole read is 200');
    t.equal(answer.headers['Content-Type'], 'video/mp4', 'the recorded type comes back');
    t.equal(answer.headers['Content-Length'], '2048', 'and the length');
    t.equal(answer.headers['Cache-Control'], 'private, max-age=60', 'and the caching hint');
    t.ok(answer.headers['Content-Disposition'] === undefined, 'inline sends no disposition');
    t.ok((await drain(answer.stream!)).equals(content), 'and the bytes');
});

t.test('download asks for the filename, and a matching ETag costs nothing', async t => {
    const content = Buffer.alloc(64, 1);
    const store = await storeOf(content, {originalFilename: 'match.mp4'});
    const download = await blobServe(
        {namespace: 'party', key: 'k', download: true},
        services(store),
    );
    t.equal(
        download.headers['Content-Disposition'],
        'attachment; filename="match.mp4"',
        'the attachment names the file',
    );
    const cached = await blobServe(
        {namespace: 'party', key: 'k', ifNoneMatch: download.headers['ETag']!},
        services(store),
    );
    t.equal(cached.code, 304, 'a matching If-None-Match is 304');
    t.equal(cached.stream, undefined, 'with no body');
});

t.test('a range is answered 206 with the window it asked for', async t => {
    const content = Buffer.alloc(1000, 0);
    for (let index = 0; index < content.length; index += 1) content[index] = index % 251;
    const store = await storeOf(content, {});
    const answer = await blobServe(
        {namespace: 'party', key: 'k', range: 'bytes=100-199'},
        services(store),
    );
    t.equal(answer.code, 206, 'a range is 206');
    t.equal(answer.headers['Content-Range'], 'bytes 100-199/1000', 'and names what it sent');
    t.equal(answer.headers['Content-Length'], '100', 'and how much');
    t.ok((await drain(answer.stream!)).equals(content.subarray(100, 200)), 'and the right bytes');
});

t.test('the range header is read strictly', async t => {
    t.same(blobRangeParse('bytes=0-9', 100), {start: 0, end: 9}, 'a closed range');
    t.same(blobRangeParse('bytes=90-', 100), {start: 90, end: 99}, 'an open end');
    t.same(blobRangeParse('bytes=-10', 100), {start: 90, end: 99}, 'a suffix range');
    t.same(
        blobRangeParse('bytes=0-999', 100),
        {start: 0, end: 99},
        'an end past the size is clamped',
    );
    t.equal(blobRangeParse('bytes=0-1,4-5', 100), null, 'two ranges are served whole');
    t.equal(blobRangeParse('bytes=100-', 100), null, 'a start past the end is no range');
    t.equal(blobRangeParse(undefined, 100), null, 'no header is no range');
    t.equal(blobContentRange({start: 5, end: 9}, 100), 'bytes 5-9/100', 'the header a 206 carries');
});

t.test('the cookie is signed, and a refusal is silent', async t => {
    const token = {
        actorId: 'u1',
        scopes: ['party:person:1'],
        exp: Math.floor(Date.now() / 1000) + 60,
    };
    const value = blobScopeSign(token, SECRET);
    t.same(blobScopeVerify(value, SECRET)?.scopes, ['party:person:1'], 'a signed token reads back');
    t.equal(blobScopeVerify(value, 'another-secret'), null, 'the wrong secret is refused');
    t.equal(blobScopeVerify(value.slice(0, -2) + 'xx', SECRET), null, 'a tampered mac is refused');
    t.equal(
        blobScopeVerify(blobScopeSign({...token, exp: 1}, SECRET), SECRET),
        null,
        'an expired token is refused',
    );
    t.equal(blobScopeVerify(undefined, SECRET), null, 'no cookie holds no scopes');
    t.equal(blobScopeVerify(value, undefined), null, 'and no secret verifies nothing');
});
