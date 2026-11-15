import t from 'tap';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';

import type {IBlobMeta} from '@feasibleone/blong';

import {cacheFind, cacheGet, cacheHead, cacheMetaPut, cachePut, cacheRemove} from './storageCache.ts';
import {storageDirectoryOf, storageMetaFromEntry} from '../adapter/storage/storageLib.ts';

/** Deterministic bytes, so a round trip is compared rather than eyeballed. */
function bytes(size: number): Buffer {
    const buffer = Buffer.alloc(size);
    for (let index = 0; index < size; index += 1) buffer[index] = (index * 31 + 7) % 256;
    return buffer;
}

async function readAll(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
}

function metaOf(key: string, size: number): IBlobMeta {
    return {
        key,
        namespace: 'test',
        contentType: 'image/png',
        size,
        digest: 'not-the-point-of-this-test',
        createdAt: new Date(0).toISOString(),
        scopes: ['anonymous'],
        scopeMode: 'any',
        state: 'stored',
        temporary: false,
    };
}

const directory = () => mkdtempSync(join(tmpdir(), 'blong-blob-store-'));

/**
 * The filesystem store round-trips a byte, a block and a megabyte.
 *
 * The three sizes are the three shapes a stream can end on: a partial final block, a whole one, and a
 * body large enough that no implementation accidentally buffers it. `head` is compared with `get`'s
 * metadata because a read path that answers `HEAD` from another source is a read path that can
 * disagree with itself.
 */
t.test('the store round-trips what it is given', async t => {
    const dir = directory();
    for (const size of [1, 16, 1024 * 1024]) {
        const key = `round-trip-${size}`;
        const content = bytes(size);
        await cachePut(dir, key, Readable.from(content), metaOf(key, size));

        const hit = await cacheGet(dir, key);
        t.ok(hit, `${size} bytes come back`);
        if (!hit) continue;
        const back = await readAll(hit.stream);
        t.equal(back.length, size, `${size} bytes arrive`);
        t.ok(back.equals(content), `${size} bytes arrive unchanged`);
        t.equal(
            (hit.entry.metadata as IBlobMeta).size,
            size,
            'the metadata names the size',
        );

        const head = await cacheHead(dir, key);
        t.same(head?.metadata, hit.entry.metadata, 'head answers what get answered');
    }
});

t.test('a key nobody wrote is absent rather than an error', async t => {
    const dir = directory();
    t.equal(await cacheHead(dir, 'absent'), null, 'head of an unwritten key');
    t.equal(await cacheGet(dir, 'absent'), null, 'get of an unwritten key');
    t.equal(await cacheRemove(dir, 'absent'), false, 'remove of an unwritten key');
});

t.test('a removed key leaves the listing and stops reading', async t => {
    const dir = directory();
    await cachePut(dir, 'keep', Readable.from(Buffer.from('keep')), metaOf('keep', 4));
    await cachePut(dir, 'drop', Readable.from(Buffer.from('drop')), metaOf('drop', 4));
    t.equal((await cacheFind(dir)).length, 2, 'two entries before the removal');
    t.equal(await cacheRemove(dir, 'drop'), true, 'the removal reports what it did');
    const left = (await cacheFind(dir)).map(entry => entry.key);
    t.same(left, ['keep'], 'and the listing holds the other key only');
    t.equal(await cacheHead(dir, 'drop'), null, 'the removed key no longer reads');
});

t.test('the metadata a reader sees is defaulted, not trusted', async t => {
    const dir = directory();
    await cachePut(dir, 'sparse', Readable.from(Buffer.from('x')), {
        contentType: 'text/plain',
    } as IBlobMeta);
    const head = await cacheHead(dir, 'sparse');
    t.ok(head, 'the entry exists');
    const meta = storageMetaFromEntry('test', head!);
    t.equal(meta.contentType, 'text/plain', 'what was written survives');
    t.equal(meta.size, 1, 'a missing size falls back to the content length');
    t.same(meta.scopes, [], 'a missing scope list is empty, which refuses every reader');
    t.equal(meta.state, 'pending', 'and a missing state is not a stored one');
});

t.test('a metadata update leaves the content where it is', async t => {
    const dir = directory();
    const content = Buffer.from('the bytes do not move');
    await cachePut(dir, 'fixed', Readable.from(content), metaOf('fixed', content.length));
    const before = await cacheHead(dir, 'fixed');
    const updated: IBlobMeta = {
        ...(before?.metadata as IBlobMeta),
        scopes: ['party:org:9'],
        state: 'stored',
    };
    t.equal(await cacheMetaPut(dir, 'fixed', updated), true, 'the index entry is rewritten');
    const after = await cacheHead(dir, 'fixed');
    t.same((after?.metadata as IBlobMeta).scopes, ['party:org:9'], 'the new scopes are there');
    const hit = await cacheGet(dir, 'fixed');
    t.ok((await readAll(hit!.stream)).equals(content), 'and the content is unchanged');
});

t.test('a namespace the configuration does not name is refused', async t => {
    const config = {directory: '/var/lib/blong/blob', namespaces: {party: {}}};
    t.equal(storageDirectoryOf(config, 'party'), '/var/lib/blong/blob/party', 'a named one resolves');
    t.throws(() => storageDirectoryOf(config, 'sport'), /sport/, 'an unnamed one is refused by name');
});
