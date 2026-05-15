import {handler, type IAssert, type IMeta} from '@feasibleone/blong';

import {copiedKey, objects, objectWithMetadata, PREFIX} from '../fixtures/object.ts';

type PutResult = {key: string; etag?: string} | string;
type GetResult = {
    body?: Uint8Array;
    contentType?: string;
    contentLength?: number;
    metadata?: Record<string, string>;
    lastModified?: Date;
    etag?: string;
};
type ListResult = {Contents?: {Key?: string}[]; KeyCount?: number};
type HeadResult = {ContentType?: string; ContentLength?: number; ETag?: string};
type StepMeta = {$meta: IMeta};

/**
 * testS3ObjectCrud — integration test covering all S3 adapter operations:
 * add, get, find (list), metadata (head), copy, remove (delete).
 *
 * Steps run in a sequential dependency chain to avoid conflicts.
 * Fixture data from `fixtures/object.ts` is used for all uploads.
 */
export default handler(
    ({
        lib: {group, checkpoint},
        handler: {
            storageObjectAdd,
            storageObjectGet,
            storageObjectFind,
            storageObjectMetadata,
            storageObjectCopy,
            storageObjectRemove,
        },
    }) => ({
        testS3ObjectCrud: ({name = 's3 object CRUD'}: {name?: string}) =>
            // chain-level mask: dynamic S3 fields (etag/ETag, lastModified/LastModified, binary body, per-request $metadata ids)
            group(name, {
                mask: [
                    'etag',
                    'body',
                    'lastModified',
                    'ETag',
                    'LastModified',
                    'Contents.*.ETag',
                    'Contents.*.LastModified',
                    '$metadata.requestId',
                    '$metadata.extendedRequestId',
                ],
            })([
                // ── 1. Wipe any leftover objects from previous runs ────────
                async function cleanObjects(assert: IAssert, {$meta}: StepMeta) {
                    const listResult = await storageObjectFind(
                        {prefix: PREFIX, maxKeys: 1000},
                        $meta,
                    );
                    const existingKeys = ((listResult as ListResult).Contents ?? [])
                        .map(obj => obj.Key)
                        .filter(Boolean) as string[];
                    for (const key of existingKeys) {
                        try {
                            await storageObjectRemove({key}, $meta);
                        } catch {
                            // ignore – object may not exist
                        }
                    }
                    assert.ok(true, 'cleanup completed');
                    return {cleaned: true};
                },

                // ── 2. add — put a plain-text object ──────────────────────
                async function addTextObject(
                    assert: IAssert,
                    {$meta, cleanObjects}: StepMeta & {cleanObjects: Promise<unknown>},
                ) {
                    await cleanObjects;
                    const obj = objects[0];
                    // Snapshot captures key and any stable fields; chain-level mask handles etag.
                    assert.snapshot();
                    return (await storageObjectAdd(
                        {key: obj.key, body: obj.body, contentType: obj.contentType},
                        $meta,
                    )) as PutResult;
                },

                // ── 3. get — retrieve the text object and verify content type
                async function getTextObject(
                    assert: IAssert,
                    {$meta, addTextObject}: StepMeta & {addTextObject: Promise<unknown>},
                ) {
                    await addTextObject;
                    // Snapshot captures contentType, contentLength; chain-level mask handles
                    // body (Uint8Array), etag, and lastModified.
                    assert.snapshot();
                    return (await storageObjectGet({key: objects[0].key}, $meta)) as GetResult;
                },

                // ── 4. add — put a JSON object ─────────────────────────────
                async function addJsonObject(
                    assert: IAssert,
                    {$meta, cleanObjects}: StepMeta & {cleanObjects: Promise<unknown>},
                ) {
                    await cleanObjects;
                    const obj = objects[1];
                    // Snapshot captures key and content type; chain-level mask handles etag.
                    assert.snapshot();
                    return (await storageObjectAdd(
                        {key: obj.key, body: obj.body, contentType: obj.contentType},
                        $meta,
                    )) as PutResult;
                },

                // ── 5. add — put object with custom metadata ───────────────
                async function addObjectWithMetadata(
                    assert: IAssert,
                    {$meta, cleanObjects}: StepMeta & {cleanObjects: Promise<unknown>},
                ) {
                    await cleanObjects;
                    // Snapshot captures key and content type; chain-level mask handles etag.
                    assert.snapshot();
                    return (await storageObjectAdd(
                        {
                            key: objectWithMetadata.key,
                            body: objectWithMetadata.body,
                            contentType: objectWithMetadata.contentType,
                            metadata: {...objectWithMetadata.metadata},
                        },
                        $meta,
                    )) as PutResult;
                },

                // ── 6. find — list objects matching the test prefix ────────
                async function findObjects(
                    assert: IAssert,
                    {
                        $meta,
                        addTextObject,
                        addJsonObject,
                    }: StepMeta & {
                        addTextObject: Promise<unknown>;
                        addJsonObject: Promise<unknown>;
                    },
                ) {
                    await addTextObject;
                    await addJsonObject;
                    const result = await storageObjectFind({prefix: PREFIX}, $meta);
                    // Sort Contents by Key for snapshot stability; chain-level mask handles
                    // ETag and LastModified on each element.
                    assert.snapshot();
                    return {
                        ...(result as ListResult),
                        Contents: (result as ListResult).Contents?.slice().sort((a, b) =>
                            (a.Key ?? '').localeCompare(b.Key ?? ''),
                        ),
                    };
                },

                // ── 7. metadata — head request to check object metadata ────
                async function headObject(
                    assert: IAssert,
                    {$meta, addTextObject}: StepMeta & {addTextObject: Promise<unknown>},
                ) {
                    await addTextObject;
                    // Snapshot captures ContentType and ContentLength; chain-level mask handles
                    // ETag and LastModified.
                    assert.snapshot();
                    return (await storageObjectMetadata(
                        {key: objects[0].key},
                        $meta,
                    )) as HeadResult;
                },

                // ── 8. copy — copy the text object to a new key ───────────
                async function copyObject(
                    assert: IAssert,
                    {$meta, addTextObject}: StepMeta & {addTextObject: Promise<unknown>},
                ) {
                    await addTextObject;
                    const result = await storageObjectCopy(
                        {
                            key: copiedKey,
                            sourceBucket: 'blong-integration',
                            sourceKey: objects[0].key,
                        },
                        $meta,
                    );
                    assert.ok(result, 'copy returned a result');
                    return {copied: true};
                },

                // ── 9. get — verify the copied object exists ───────────────
                async function getNewKey(
                    assert: IAssert,
                    {$meta, copyObject}: StepMeta & {copyObject: Promise<unknown>},
                ) {
                    await copyObject;
                    // Snapshot captures contentType matching the source; chain-level mask
                    // handles body, etag, and lastModified.
                    assert.snapshot();
                    return (await storageObjectGet({key: copiedKey}, $meta)) as GetResult;
                },

                // Phase checkpoint: snapshot all object read results together
                checkpoint(
                    'object-reads',
                    'getTextObject',
                    'headObject',
                    'findObjects',
                    'getNewKey',
                ),

                // ── 10. remove — delete all test objects ───────────────────
                async function removeObjects(
                    assert: IAssert,
                    {
                        $meta,
                        findObjects,
                        headObject,
                        getNewKey,
                        addObjectWithMetadata,
                    }: StepMeta & {
                        findObjects: Promise<unknown>;
                        headObject: Promise<unknown>;
                        getNewKey: Promise<unknown>;
                        addObjectWithMetadata: Promise<unknown>;
                    },
                ) {
                    await findObjects;
                    await headObject;
                    await getNewKey;
                    await addObjectWithMetadata;
                    for (const key of [
                        objects[0].key,
                        objects[1].key,
                        objectWithMetadata.key,
                        copiedKey,
                    ]) {
                        const result = await storageObjectRemove({key}, $meta);
                        assert.ok(result !== undefined, `remove ${key} returned a result`);
                    }
                    return {removed: true};
                },

                // ── 11. find — verify all test objects are gone ────────────
                async function verifyRemoval(
                    assert: IAssert,
                    {$meta, removeObjects}: StepMeta & {removeObjects: Promise<unknown>},
                ) {
                    await removeObjects;
                    const result = await storageObjectFind({prefix: PREFIX, maxKeys: 100}, $meta);
                    assert.ok(result, 'find after removal returned a result');
                    const contents = (result as ListResult).Contents ?? [];
                    assert.strictEqual(
                        contents.length,
                        0,
                        'no blong test objects remain after removal',
                    );
                    return result;
                },
            ]),
    }),
);
