import {type IAssert, type IMeta, handler} from '@feasibleone/blong';
import {Readable} from 'node:stream';
import sharp from 'sharp';

import {blobVariantKey} from '../../../blob/blobVariants.ts';

/** A 1200x800 PNG, drawn by the library the handler will resize with. */
async function photograph(): Promise<Buffer> {
    return sharp({
        create: {width: 1200, height: 800, channels: 3, background: {r: 20, g: 120, b: 200}},
    })
        .png()
        .toBuffer();
}

/**
 * `test.variants` — a committed photograph carries a thumbnail, and a text file carries none.
 *
 * The upload path is the one that derives, so the test drives it end to end: prepare, write the bytes,
 * commit. The assertion is about the record and the bytes rather than about a call: the thumbnail is
 * 160x160, it is a blob of its own, and its content is not the original's — a variant that is a copy
 * with a new name is the failure this catches.
 *
 * Registered as the `test.variants` group (`integration.watch.test` in index.ts).
 */
export default handler(
    ({
        lib: {group},
        handler: {
            blobBlobGet,
            blobRead,
            blobThumb,
            blobUploadCommit,
            blobUploadPrepare,
            blobUploadWrite,
        },
    }) => ({
        testVariants: () =>
            group('variants')([
                async function thumbnail(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const png = await photograph();
                    const prepared = (await blobUploadPrepare(
                        {
                            namespace: 'test',
                            contentType: 'image/png',
                            filename: 'portrait.png',
                            size: png.length,
                            scopes: ['anonymous'],
                        },
                        {...$meta, method: 'blob.upload.prepare'} as IMeta,
                    )) as {key: string};
                    await blobUploadWrite(
                        {
                            namespace: 'test',
                            uploadId: prepared.key,
                            body: Readable.from(png) as unknown as NodeJS.ReadableStream,
                        },
                        {...$meta, method: 'blob.upload.write'} as IMeta,
                    );
                    const committed = (await blobUploadCommit(
                        {namespace: 'test', key: prepared.key, variants: ['normal']},
                        {...$meta, method: 'blob.upload.commit'} as IMeta,
                    )) as {key: string};

                    // `blob.head` answers headers and no body, so the record is read through `get`.
                    const record = (await blobBlobGet(
                        {namespace: 'test', key: committed.key},
                        $meta,
                    )) as {
                        variants?: Record<string, {key: string; width?: number; height?: number}>;
                    };
                    const thumb = record?.variants?.['thumb'];
                    assert.ok(thumb, 'the record carries a thumbnail');
                    assert.equal(thumb?.width, 160, 'a thumbnail is 160 wide');
                    assert.equal(thumb?.height, 160, 'and 160 high');
                    assert.equal(
                        thumb?.key,
                        blobVariantKey(committed.key, 'thumb'),
                        'stored under its own key',
                    );
                    assert.ok(
                        record?.variants?.['normal'],
                        'and the normal size the caller asked for',
                    );

                    const read = (await blobRead(
                        {namespace: 'test', key: committed.key, variant: 'thumb'},
                        $meta,
                    )) as Readable | null;
                    assert.ok(read, 'the thumbnail serves as a variant of the same key');
                    const bytes: Buffer[] = [];
                    for await (const chunk of read!) bytes.push(Buffer.from(chunk as Buffer));
                    const thumbBytes = Buffer.concat(bytes);
                    assert.ok(thumbBytes.length > 0, 'and it has bytes');
                    assert.equal(
                        thumbBytes.equals(png),
                        false,
                        'which differ from the original they were derived from',
                    );
                    return {key: committed.key, thumb: thumbBytes};
                },

                async function noVariantForText(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const text = Buffer.from('a report nobody needs a thumbnail of');
                    const prepared = (await blobUploadPrepare(
                        {
                            namespace: 'test',
                            contentType: 'text/plain',
                            filename: 'report.txt',
                            size: text.length,
                            scopes: ['anonymous'],
                        },
                        {...$meta, method: 'blob.upload.prepare'} as IMeta,
                    )) as {key: string};
                    await blobUploadWrite(
                        {
                            namespace: 'test',
                            uploadId: prepared.key,
                            body: Readable.from(text) as unknown as NodeJS.ReadableStream,
                        },
                        {...$meta, method: 'blob.upload.write'} as IMeta,
                    );
                    const committed = (await blobUploadCommit(
                        {namespace: 'test', key: prepared.key},
                        {...$meta, method: 'blob.upload.commit'} as IMeta,
                    )) as {key: string};
                    const record = (await blobBlobGet(
                        {namespace: 'test', key: committed.key},
                        $meta,
                    )) as {variants?: Record<string, unknown>};
                    assert.equal(record?.variants, undefined, 'a text file produces no variant');
                    return {done: true};
                },

                // 3. `blob.thumb` is the read route's variant: the same record, served at the size the
                //    store derived, so a page never downloads a photograph to draw a 160px box
                //    (`@@D-844`).
                async function theThumbRouteAnswersTheDerivedSize(
                    assert: IAssert,
                    {$meta, thumbnail: derived}: {$meta: IMeta; thumbnail: Promise<{key: string}>},
                ) {
                    const {key} = await derived;
                    const stream = (await blobThumb({namespace: 'test', key}, $meta)) as Readable;
                    const chunks: Buffer[] = [];
                    for await (const chunk of stream) chunks.push(chunk as Buffer);
                    const thumb = Buffer.concat(chunks);
                    assert.ok(thumb.length > 0, 'the route answers bytes');
                    const record = (await blobBlobGet({namespace: 'test', key}, $meta)) as {
                        variants?: Record<string, {key?: string; width?: number}>;
                    };
                    const variant = record.variants?.['thumb'];
                    assert.ok(variant?.key, 'the record names a thumb key');
                    assert.equal(variant?.width, 160, 'at the size the settings gave it');
                    return {done: true};
                },
            ]),
    }),
);
