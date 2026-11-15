import t from 'tap';
import {Readable} from 'node:stream';

import type {IBlobMeta, IMeta} from '@feasibleone/blong';

import s3StoreLib from './s3StoreLib.ts';
import storageBlobFind from './storageBlobFind.ts';
import storageBlobGet from './storageBlobGet.ts';
import storageBlobHead from './storageBlobHead.ts';
import storageBlobMetaPut from './storageBlobMetaPut.ts';
import storageBlobPut from './storageBlobPut.ts';
import storageBlobRemove from './storageBlobRemove.ts';
import storageInfo from './storageInfo.ts';

/**
 * The S3 store's handlers, against a bucket that is a `Map`.
 *
 * What an S3 port would do is not what these assertions are about — the framework's adapter answers that,
 * and the harness proves it with a live MinIO. What is asserted here is the shape this realm adds on top:
 * two objects per blob, a record beside its bytes, a listing that skips records, and a namespace the
 * configuration refuses. The fake port answers the four operations the group uses and remembers what it
 * was asked for.
 */
function port() {
    const objects = new Map<string, Buffer>();
    const calls: string[] = [];
    return {
        objects,
        calls,
        // The adapter's own context, which is where a failure is noted for `storage.info` to report.
        config: {context: {} as {lastFailure?: {at: string; reason: string}}},
        exec: async (params: Record<string, unknown>, $meta: IMeta) => {
            const operation = $meta.method!.split('.').pop();
            calls.push(`${operation}:${String(params.key ?? params.prefix)}`);
            const key = String(params.key ?? '');
            switch (operation) {
                case 'add': {
                    const body = params.body as Buffer | Readable;
                    objects.set(
                        key,
                        Buffer.isBuffer(body)
                            ? body
                            : await drainStream(body as Readable),
                    );
                    return {key};
                }
                case 'get': {
                    const found = objects.get(key);
                    if (!found) throw Object.assign(new Error('not found'), {type: 's3.notFound'});
                    return {body: new Uint8Array(found)};
                }
                case 'stream': {
                    const found = objects.get(key);
                    if (!found) throw Object.assign(new Error('not found'), {type: 's3.notFound'});
                    return {body: Readable.from(found), contentLength: found.length};
                }
                case 'head': {
                    if (!objects.has(key)) {
                        throw Object.assign(new Error('not found'), {type: 's3.notFound'});
                    }
                    return {contentLength: objects.get(key)!.length};
                }
                case 'remove': {
                    objects.delete(key);
                    return {};
                }
                case 'find': {
                    const prefix = String(params.prefix ?? '');
                    return {
                        contents: [...objects.keys()]
                            .filter(candidate => candidate.startsWith(prefix))
                            .map(candidate => ({
                                Key: candidate,
                                Size: objects.get(candidate)?.length ?? 0,
                            })),
                    };
                }
                default:
                    throw new Error(`unexpected operation ${operation}`);
            }
        },
    };
}

async function drainStream(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
    return Buffer.concat(chunks);
}

const meta = (key: string, extra: Partial<IBlobMeta> = {}): IBlobMeta => ({
    key,
    namespace: 'party',
    contentType: 'image/png',
    size: 5,
    digest: 'digest',
    createdAt: new Date(0).toISOString(),
    scopes: ['party:person:1'],
    scopeMode: 'any',
    state: 'stored',
    temporary: false,
    expiresAt: null,
    ...extra,
});

/** The six methods, built the way the framework builds them, over one fake port. */
function subject(config: Record<string, unknown> = {}) {
    const lib = (
        s3StoreLib as unknown as (api: unknown) => Record<string, unknown>
    )({config: {namespaces: {party: {}}, ...config}});
    const api = {lib, handler: {}};
    const methods = {
        put: (storageBlobPut as unknown as (a: unknown) => Record<string, unknown>)(api),
        get: (storageBlobGet as unknown as (a: unknown) => Record<string, unknown>)(api),
        head: (storageBlobHead as unknown as (a: unknown) => Record<string, unknown>)(api),
        find: (storageBlobFind as unknown as (a: unknown) => Record<string, unknown>)(api),
        remove: (storageBlobRemove as unknown as (a: unknown) => Record<string, unknown>)(api),
        metaPut: (storageBlobMetaPut as unknown as (a: unknown) => Record<string, unknown>)(api),
        info: (storageInfo as unknown as (a: unknown) => Record<string, unknown>)(api),
    };
    const store = port();
    const call = (name: keyof typeof methods, params: object, $meta: IMeta = {} as IMeta) =>
        (methods[name] as Record<string, (p: object, m: IMeta) => Promise<unknown>>)[
            Object.keys(methods[name] as object)[0]!
        ].call(store, params, $meta);
    return {store, call};
}

t.test('a blob is two objects, and both reads answer it', async t => {
    const {store, call} = subject();
    await call('put', {namespace: 'party', key: 'k1', body: Readable.from(Buffer.from('hello')), metadata: meta('k1')});
    t.same(
        [...store.objects.keys()].sort(),
        ['party/k1', 'party/k1.meta.json'],
        'the bytes and the record beside them, under the namespace',
    );

    const head = (await call('head', {namespace: 'party', key: 'k1'})) as IBlobMeta | null;
    t.equal(head?.key, 'k1', 'head answers the record, named by its own key');
    t.equal(head?.namespace, 'party', 'and by its namespace, not the key it sits under');
    t.same(head?.scopes, ['party:person:1'], 'with the scopes it was written with');

    const got = (await call('get', {namespace: 'party', key: 'k1'})) as {
        meta: IBlobMeta;
        stream: Readable;
    };
    t.equal(await drainStream(got.stream).then(b => b.toString()), 'hello', 'get answers the bytes');
    t.equal(got.meta.digest, 'digest', 'and the record');
});

t.test('a key nobody wrote answers null, not a failure', async t => {
    const {call} = subject();
    t.equal(await call('head', {namespace: 'party', key: 'absent'}), null, 'head of nothing is null');
    t.equal(await call('get', {namespace: 'party', key: 'absent'}), null, 'and so is get');
});

t.test('a listing skips the records and keeps the namespace apart', async t => {
    const {call, store} = subject();
    for (const key of ['a', 'b']) {
        await call('put', {
            namespace: 'party',
            key,
            body: Readable.from(Buffer.from(key)),
            metadata: meta(key),
        });
    }
    store.objects.set('sport/c', Buffer.from('c'));

    const found = (await call('find', {namespace: 'party'})) as {blob: IBlobMeta[]};
    t.same(found.blob.map(entry => entry.key).sort(), ['a', 'b'], 'only the blobs of this namespace');
    const narrowed = (await call('find', {namespace: 'party', prefix: 'b'})) as {blob: IBlobMeta[]};
    t.same(narrowed.blob.map(entry => entry.key), ['b'], 'a prefix narrows the listing');
});

t.test('an expiry filter answers only what passed it', async t => {
    const {call} = subject();
    const past = new Date(Date.now() - 60_000).toISOString();
    await call('put', {
        namespace: 'party',
        key: 'expired',
        body: Readable.from(Buffer.from('x')),
        metadata: meta('expired', {temporary: true, expiresAt: past}),
    });
    await call('put', {
        namespace: 'party',
        key: 'live',
        body: Readable.from(Buffer.from('y')),
        metadata: meta('live'),
    });
    const found = (await call('find', {
        namespace: 'party',
        expiredBefore: new Date().toISOString(),
    })) as {blob: IBlobMeta[]};
    t.same(found.blob.map(entry => entry.key), ['expired'], 'a record with no expiry is not expired');
});

t.test('a record can be replaced without touching the bytes', async t => {
    const {call, store} = subject();
    await call('put', {
        namespace: 'party',
        key: 'k',
        body: Readable.from(Buffer.from('bytes')),
        metadata: meta('k'),
    });
    await call('metaPut', {
        namespace: 'party',
        key: 'k',
        metadata: meta('k', {scopes: ['party:org:2'], state: 'stored'}),
    });
    const head = (await call('head', {namespace: 'party', key: 'k'})) as IBlobMeta;
    t.same(head.scopes, ['party:org:2'], 'the record carries what was written over it');
    t.equal(store.objects.get('party/k')?.toString(), 'bytes', 'and the bytes are untouched');
});

t.test('removing a blob removes its record too', async t => {
    const {call, store} = subject();
    await call('put', {
        namespace: 'party',
        key: 'k',
        body: Readable.from(Buffer.from('bytes')),
        metadata: meta('k'),
    });
    const answer = (await call('remove', {namespace: 'party', key: 'k'})) as {removed: boolean};
    t.equal(answer.removed, true, 'the content was there and is gone');
    t.same([...store.objects.keys()], [], 'and nothing of it is left behind');
    const again = (await call('remove', {namespace: 'party', key: 'k'})) as {removed: boolean};
    t.equal(again.removed, false, 'a second removal says there was nothing to remove');
});

t.test('a namespace the configuration does not name is refused', async t => {
    const {call} = subject();
    await t.rejects(
        call('head', {namespace: 'sport', key: 'k'}),
        /sport/,
        'the refusal names the namespace nobody configured',
    );
});

t.test('a prefix keeps one suite out of another suite’s keys', async t => {
    const {call, store} = subject({prefix: 'suite/'});
    await call('put', {
        namespace: 'party',
        key: 'k',
        body: Readable.from(Buffer.from('bytes')),
        metadata: meta('k'),
    });
    t.same(
        [...store.objects.keys()].sort(),
        ['suite/party/k', 'suite/party/k.meta.json'],
        'every object carries the prefix the deployment owns',
    );
});

t.test('the store says what it can do, and what went wrong last', async t => {
    const {call, store} = subject();
    const first = (await call('info', {}, {method: 'storage.info'} as IMeta)) as {
        backend: string;
        streams: boolean;
        ranges: boolean;
        metadataCeiling: number | null;
        lastFailure?: {reason: string} | null;
    };
    t.equal(first.backend, 's3', 'the backend is named');
    t.equal(first.streams, true, 'a bucket streams');
    t.equal(first.ranges, true, 'and ranges');
    t.equal(first.metadataCeiling, null, 'and imposes no record ceiling of its own');
    t.equal(first.lastFailure ?? null, null, 'nothing has failed yet');

    // A read of an object that is not there is the failure a probe would want to see.
    await call('head', {namespace: 'party', key: 'absent'}).catch(() => null);
    const after = (await call('info', {}, {method: 'storage.info'} as IMeta)) as {
        lastFailure?: {reason: string} | null;
    };
    t.match(after.lastFailure?.reason ?? '', /not found/, 'the last failure is reported');
    t.ok(store.config.context.lastFailure?.at, 'with when it happened');
});
