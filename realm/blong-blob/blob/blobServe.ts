import {PassThrough, type Readable, type Transform} from 'node:stream';

import type {IBlobMeta} from '@feasibleone/blong';

import {blobContentRange, blobRangeParse} from './blobRange.ts';
import {blobSlice} from './blobSlice.ts';

/** What a read route asks for. */
export interface IServeInput {
    namespace: string;
    key: string;
    /** A derived variant to serve instead of the blob itself: `thumb`. */
    variant?: string;
    /** Answer as an attachment rather than inline. */
    download?: boolean;
    /** The request's `Range` header. */
    range?: string;
    /** The request's `If-None-Match` header. */
    ifNoneMatch?: string;
}

/** What the handler can do, passed in so the answer can be built without a suite. */
export interface IServeServices {
    head: (namespace: string, key: string) => Promise<IBlobMeta | null>;
    get: (namespace: string, key: string) => Promise<{meta: IBlobMeta; stream: Readable} | null>;
    decrypt: (crypto: NonNullable<IBlobMeta['crypto']>) => Transform;
    verify: (digest: string) => Transform;
}

/** What a read route answers with. */
export interface IServeResult {
    code: number;
    headers: Record<string, string>;
    /** Absent for `304` and for a `HEAD`. */
    stream?: Readable;
    meta: IBlobMeta;
}

/** The metadata `Cache-Control` the record names, or one that fits what it is. */
function cacheControlOf(meta: IBlobMeta): string {
    if (meta.cacheControl) return meta.cacheControl;
    return meta.temporary ? 'private, no-store' : 'private, max-age=3600';
}

/**
 * Build the answer for one blob: its headers, its status, and the stream to send.
 *
 * The headers come from the record and not from the bytes — content type, length and the caching hint
 * are what a browser needs before it has read anything (@@D-836). A `Range` is answered `206` with a
 * `Content-Range`, a matching `If-None-Match` is answered `304` with no body, and `download` asks for
 * the filename rather than for the viewer.
 *
 * The read is decrypted and digest-checked in the same pipeline, so a tampered file is destroyed
 * rather than delivered with the wrong bytes.
 */
export async function blobServe(
    input: IServeInput,
    services: IServeServices,
    headOnly = false,
): Promise<IServeResult> {
    const notFound = () =>
        Object.assign(new Error('blob not found'), {
            type: 'blob.notFound',
            params: {namespace: input.namespace, key: input.key},
        });

    const meta = await services.head(input.namespace, input.key);
    if (!meta) throw notFound();
    const targetKey = input.variant ? meta.variants?.[input.variant]?.key : input.key;
    if (!targetKey) throw notFound();
    const target = targetKey === input.key ? meta : await services.head(input.namespace, targetKey);
    if (!target) throw notFound();

    const etag = `"${target.digest}"`;
    const headers: Record<string, string> = {
        'Content-Type': target.contentType || 'application/octet-stream',
        'Content-Length': String(target.size),
        ETag: etag,
        'Accept-Ranges': 'bytes',
        'Cache-Control': cacheControlOf(target),
        'X-Content-Type-Options': 'nosniff',
    };
    if (input.download) {
        const name = target.originalFilename ?? input.key;
        headers['Content-Disposition'] = `attachment; filename="${name.replace(/"/g, '')}"`;
    }

    if (input.ifNoneMatch && input.ifNoneMatch === etag) {
        return {
            code: 304,
            headers: {ETag: etag, 'Cache-Control': headers['Cache-Control']!},
            meta: target,
        };
    }

    const range = blobRangeParse(input.range, target.size);
    if (range) {
        headers['Content-Range'] = blobContentRange(range, target.size);
        headers['Content-Length'] = String(range.end - range.start + 1);
    }
    const code = range ? 206 : 200;
    if (headOnly) return {code, headers, meta: target};

    const hit = await services.get(input.namespace, targetKey);
    if (!hit) throw notFound();

    // The stages are chained by hand rather than with `pipeline`, because the answer may be returned
    // to a client that disconnects: a destroyed stream must not reject a promise nobody holds.
    const out = new PassThrough();
    let current: Readable | Transform = hit.stream;
    if (hit.meta.crypto) current = current.pipe(services.decrypt(hit.meta.crypto));
    current = current.pipe(services.verify(hit.meta.digest));
    if (range) current = current.pipe(blobSlice(range.start, range.end));
    current.pipe(out);
    current.once('error', error => out.destroy(error as Error));
    return {code, headers, stream: out, meta: target};
}
