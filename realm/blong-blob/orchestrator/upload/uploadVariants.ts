import {createHash} from 'node:crypto';
import {Readable, type Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import sharp from 'sharp';

import type {IBlobCrypto, IBlobMeta, IBlobVariant, IMeta} from '@feasibleone/blong';
import {library} from '@feasibleone/blong';

import type {IBlobSettings} from '../../blob/blobSettings.ts';
import {
    blobVariantKey,
    blobVariantRequests,
    blobVariantSource,
    type BlobVariantName,
} from '../../blob/blobVariants.ts';

/** What the derivation needs to know about the blob it derives from. */
export interface IVariantsInput {
    namespace: string;
    key: string;
    meta: IBlobMeta;
    settings: IBlobSettings;
    /** The variants a caller asked for by name; `thumb` is always produced. */
    requested?: readonly string[];
}

/** The group's contribution, typed for the handler that calls it. */
export interface IVariantsLib {
    /** Derive the images a record should carry, and answer the map to put on it. */
    uploadVariants: (
        input: IVariantsInput,
        $meta: IMeta,
    ) => Promise<Record<string, IBlobVariant> | undefined>;
}

/**
 * `uploadVariants` — the thumbnails a committed photograph carries.
 *
 * The library is native (`sharp`) and it needs the *plaintext*, so the source blob is decrypted into
 * memory once, resized per variant, and each result is encrypted and stored as a blob of its own. A
 * variant is therefore indistinguishable from any other stored blob to the read path: same scope
 * check, same range handling, same cookie (@@D-844).
 *
 * Every reason to produce nothing answers `undefined` rather than an error — a record that says it
 * has no variants is a record a reader serves as it is, and a thumbnail is never worth failing a
 * commit for: a text file, a photograph over `variants.maxBytes`, a corrupt image, a missing key.
 */
export default library(
    ({handler, lib}: {handler?: Record<string, unknown>; lib?: Record<string, unknown>}) => {
        const call = (name: string, params: object, $meta: IMeta): Promise<unknown> => {
            const fn = (handler as Record<string, (p: object, m: IMeta) => Promise<unknown>>)[name];
            if (typeof fn !== 'function') throw new Error(`blob: ${name} is not registered`);
            return fn(params, $meta);
        };
        const decrypt = lib?.['blobDecrypt'] as (
            next: IBlobSettings['crypto'],
            crypto: IBlobCrypto,
        ) => Transform;
        const encrypt = lib?.['blobEncrypt'] as (next: IBlobSettings['crypto']) => {
            crypto: IBlobCrypto;
            stream: Transform;
        };

        return {
            async uploadVariants(
                input: IVariantsInput,
                $meta: IMeta,
            ): Promise<Record<string, IBlobVariant> | undefined> {
                const {meta, settings} = input;
                if (!settings.variants.enabled) return undefined;
                if (!blobVariantSource(meta.contentType)) return undefined;
                if ((meta.size ?? 0) > settings.variants.maxBytes) return undefined;
                const requests = blobVariantRequests(settings.variants, input.requested);
                if (!requests.length) return undefined;

                const hit = (await call(
                    'storageBlobGet',
                    {namespace: input.namespace, key: input.key},
                    $meta,
                )) as {meta: IBlobMeta; stream: Readable} | null;
                if (!hit) return undefined;

                const plain = await collect(
                    hit.stream,
                    meta.crypto ? decrypt(settings.crypto, meta.crypto) : undefined,
                );
                let source: sharp.Sharp;
                try {
                    source = sharp(plain);
                    await source.metadata();
                } catch {
                    // A recorded image type whose bytes are not one: nothing to derive from.
                    return undefined;
                }

                const format = meta.contentType === 'image/png' ? 'png' : 'jpeg';
                const variants: Record<string, IBlobVariant> = {};
                for (const request of requests) {
                    let derived: Buffer;
                    try {
                        const resized = source.clone().resize({
                            width: request.width,
                            ...(request.height === undefined ? {} : {height: request.height}),
                            fit: request.fit,
                        });
                        derived = await (
                            format === 'png' ? resized.png() : resized.jpeg()
                        ).toBuffer();
                    } catch {
                        continue;
                    }
                    const key = blobVariantKey(input.key, request.name as BlobVariantName);
                    const {crypto, stream} = encrypt(settings.crypto);
                    const ciphertext = await collect(Readable.from(derived), stream);
                    const record: IBlobMeta = {
                        key,
                        namespace: input.namespace,
                        contentType: meta.contentType,
                        size: derived.length,
                        digest: createHash('sha256').update(derived).digest('hex'),
                        createdAt: new Date().toISOString(),
                        createdBy: meta.createdBy,
                        // The parent's name, so a download of the thumbnail is named like the file it
                        // came from rather than after a key nobody chose.
                        originalFilename: meta.originalFilename,
                        scopes: meta.scopes,
                        scopeMode: meta.scopeMode,
                        state: 'stored',
                        temporary: false,
                        expiresAt: null,
                        cacheControl: meta.cacheControl,
                        crypto,
                    };
                    await call(
                        'storageBlobPut',
                        {
                            namespace: input.namespace,
                            key,
                            body: Readable.from(ciphertext),
                            metadata: record,
                        },
                        $meta,
                    );
                    variants[request.name] = {
                        key,
                        width: request.width,
                        height: request.height ?? undefined,
                    };
                }
                return Object.keys(variants).length ? variants : undefined;
            },
        };
    },
);

/** Drain a stream, through an optional transform, into one buffer. */
async function collect(stream: Readable, through?: Transform): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const sink = async function* (source: AsyncIterable<Buffer>) {
        for await (const chunk of source) chunks.push(Buffer.from(chunk));
    };
    if (through) await pipeline(stream, through, sink);
    else await pipeline(stream, sink);
    return Buffer.concat(chunks);
}
