import {handler, type IMeta} from '@feasibleone/blong';
import type Assert from 'node:assert';

import {copiedKey, objectWithMetadata, objects, PREFIX} from '../fixtures/object.ts';

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
        lib: {group},
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
            group(name)([
                // ── 1. Wipe any leftover objects from previous runs ────────
                async function cleanObjects(assert: typeof Assert, {$meta}: StepMeta) {
                    const listResult = await storageObjectFind({prefix: PREFIX, maxKeys: 1000}, $meta);
                    const existingKeys =
                        ((listResult as ListResult).Contents ?? []).map(obj => obj.Key).filter(Boolean) as string[];
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
                    assert: typeof Assert,
                    {$meta, cleanObjects}: StepMeta & {cleanObjects: Promise<unknown>},
                ) {
                    await cleanObjects;
                    const obj = objects[0];
                    const result = await storageObjectAdd(
                        {key: obj.key, body: obj.body, contentType: obj.contentType},
                        $meta,
                    );
                    assert.ok(result, 'add text object returned a result');
                    return result as PutResult;
                },

                // ── 3. get — retrieve the text object and verify content type
                async function getTextObject(
                    assert: typeof Assert,
                    {$meta, addTextObject}: StepMeta & {addTextObject: Promise<unknown>},
                ) {
                    await addTextObject;
                    const result = await storageObjectGet({key: objects[0].key}, $meta);
                    assert.ok(result, 'get text object returned a result');
                    assert.strictEqual(
                        (result as GetResult).contentType,
                        objects[0].contentType,
                        'get returned the correct content type',
                    );
                    return result as GetResult;
                },

                // ── 4. add — put a JSON object ─────────────────────────────
                async function addJsonObject(
                    assert: typeof Assert,
                    {$meta, cleanObjects}: StepMeta & {cleanObjects: Promise<unknown>},
                ) {
                    await cleanObjects;
                    const obj = objects[1];
                    const result = await storageObjectAdd(
                        {key: obj.key, body: obj.body, contentType: obj.contentType},
                        $meta,
                    );
                    assert.ok(result, 'add JSON object returned a result');
                    return result as PutResult;
                },

                // ── 5. add — put object with custom metadata ───────────────
                async function addObjectWithMetadata(
                    assert: typeof Assert,
                    {$meta, cleanObjects}: StepMeta & {cleanObjects: Promise<unknown>},
                ) {
                    await cleanObjects;
                    const result = await storageObjectAdd(
                        {
                            key: objectWithMetadata.key,
                            body: objectWithMetadata.body,
                            contentType: objectWithMetadata.contentType,
                            metadata: {...objectWithMetadata.metadata},
                        },
                        $meta,
                    );
                    assert.ok(result, 'add object with metadata returned a result');
                    return result as PutResult;
                },

                // ── 6. find — list objects matching the test prefix ────────
                async function findObjects(
                    assert: typeof Assert,
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
                    assert.ok(result, 'find objects returned a result');
                    assert.ok(
                        (result as ListResult).Contents !== undefined,
                        'find returned a Contents array',
                    );
                    assert.ok(
                        ((result as ListResult).Contents?.length ?? 0) >= 2,
                        'find returned at least 2 objects',
                    );
                    return result as ListResult;
                },

                // ── 7. metadata — head request to check object metadata ────
                async function headObject(
                    assert: typeof Assert,
                    {$meta, addTextObject}: StepMeta & {addTextObject: Promise<unknown>},
                ) {
                    await addTextObject;
                    const result = await storageObjectMetadata({key: objects[0].key}, $meta);
                    assert.ok(result, 'metadata (head) returned a result');
                    assert.strictEqual(
                        (result as HeadResult).ContentType,
                        objects[0].contentType,
                        'head returned the correct content type',
                    );
                    return result as HeadResult;
                },

                // ── 8. copy — copy the text object to a new key ───────────
                async function copyObject(
                    assert: typeof Assert,
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
                    assert: typeof Assert,
                    {$meta, copyObject}: StepMeta & {copyObject: Promise<unknown>},
                ) {
                    await copyObject;
                    const result = await storageObjectGet({key: copiedKey}, $meta);
                    assert.ok(result, 'get copied object returned a result');
                    assert.strictEqual(
                        (result as GetResult).contentType,
                        objects[0].contentType,
                        'copied object has the same content type as the source',
                    );
                    return result as GetResult;
                },

                // ── 10. remove — delete all test objects ───────────────────
                async function removeObjects(
                    assert: typeof Assert,
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
                    assert: typeof Assert,
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
