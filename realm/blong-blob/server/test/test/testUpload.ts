import {type IAssert, type IMeta, handler} from '@feasibleone/blong';
import {Readable} from 'node:stream';

import type {IBlobMeta} from '@feasibleone/blong';

/** What `blob.upload.prepare` answers. */
type Prepared = {namespace: string; key: string; uri: string; uploadUrl: string; expiresAt: string};

/** What `blob.upload.commit` answers. */
type Committed = {namespace: string; key: string; uri: string; size: number; digest: string};

/** The refusal a call produced, as its error type: a passing test never prints a stack. */
async function refusalOf(call: () => unknown): Promise<string> {
    try {
        await call();
        return '';
    } catch (error) {
        return (error as {type?: string}).type ?? 'unknown';
    }
}

/** The bytes of one blob, so a round trip compares content rather than length. */
async function readAll(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
}

/**
 * `test.upload` — the three calls of an upload, and the three ways one can go wrong.
 *
 * Prepare records what is coming and answers where the bytes go (`@@D-840`); write streams them in and
 * leaves the record `pending`; commit is the form being submitted, and it is the only step that makes
 * the blob servable. The refusals are the states a browser can actually reach: a key that is already
 * stored, a key nobody reserved, and a record that was discarded before the bytes arrived.
 *
 * Registered as the `test.upload` group (`integration.watch.test` in index.ts).
 */
export default handler(
    ({
        lib: {group},
        handler: {
            blobUploadPrepare,
            blobUploadWrite,
            blobUploadCommit,
            blobUploadDiscard,
            blobRead,
            storageBlobHead,
        },
    }) => ({
        testUpload: () =>
            group('upload')([
                async function aFileArrivesInThreeSteps(assert: IAssert) {
                    const content = Buffer.from('a contract somebody attached');
                    const prepared = (await blobUploadPrepare(
                        {
                            namespace: 'test',
                            contentType: 'text/plain',
                            filename: 'contract.txt',
                            size: content.length,
                            scopes: ['anonymous'],
                        },
                        {} as IMeta,
                    )) as Prepared;
                    assert.ok(prepared.key, 'prepare reserves a key');
                    assert.ok(
                        prepared.uploadUrl.includes(prepared.key),
                        'and answers where to put it',
                    );
                    assert.ok(prepared.expiresAt, 'with a window to do it in');

                    // Pending: the bytes are there but the form was not submitted, so nothing serves
                    // it yet.
                    const pending = (await storageBlobHead(
                        {namespace: 'test', key: prepared.key},
                        {} as IMeta,
                    )) as IBlobMeta;
                    assert.equal(pending.state, 'pending', 'a reserved key is pending');
                    assert.equal(
                        pending.originalFilename,
                        'contract.txt',
                        'and remembers the name',
                    );

                    await blobUploadWrite(
                        {
                            namespace: 'test',
                            uploadId: prepared.key,
                            body: Readable.from(content) as unknown as NodeJS.ReadableStream,
                        },
                        {} as IMeta,
                    );
                    const committed = (await blobUploadCommit(
                        {namespace: 'test', key: prepared.key},
                        {} as IMeta,
                    )) as Committed;
                    assert.equal(
                        committed.uri,
                        `blob://test/${prepared.key}`,
                        'commit names the URI',
                    );
                    assert.equal(committed.size, content.length, 'and the size of the plaintext');
                    assert.ok(committed.digest, 'and its digest');

                    const read = await readAll(
                        (await blobRead(
                            {namespace: 'test', key: prepared.key},
                            {} as IMeta,
                        )) as Readable,
                    );
                    assert.ok(read.equals(content), 'the bytes come back as they went in');
                    return committed;
                },

                async function aCommittedBlobHasNoLifetime(
                    assert: IAssert,
                    {
                        aFileArrivesInThreeSteps: threeSteps,
                    }: {aFileArrivesInThreeSteps: Promise<Committed>},
                ) {
                    // The window belongs to the upload, not to the file: keeping it would leave a
                    // stored photograph for the sweep to delete (`@@D-840`).
                    const {key, namespace} = await threeSteps;
                    const stored = (await storageBlobHead(
                        {namespace, key},
                        {} as IMeta,
                    )) as IBlobMeta;
                    assert.equal(stored.state, 'stored', 'the record is stored');
                    assert.equal(stored.temporary, false, 'and permanent');
                    assert.equal(stored.expiresAt ?? null, null, 'with no expiry left on it');
                    return {done: true};
                },

                async function aStoredKeyIsNotWrittenTwice(
                    assert: IAssert,
                    {
                        aFileArrivesInThreeSteps: threeSteps,
                    }: {aFileArrivesInThreeSteps: Promise<Committed>},
                ) {
                    const {key, namespace} = await threeSteps;
                    assert.equal(
                        await refusalOf(() =>
                            blobUploadWrite(
                                {
                                    namespace,
                                    uploadId: key,
                                    body: Readable.from(
                                        Buffer.from('again'),
                                    ) as unknown as NodeJS.ReadableStream,
                                },
                                {} as IMeta,
                            ),
                        ),
                        'blob.uploadAlreadyStored',
                        'bytes are refused for a key that is already stored',
                    );
                    return {done: true};
                },

                async function aKeyNobodyReservedIsRefused(assert: IAssert) {
                    assert.equal(
                        await refusalOf(() =>
                            blobUploadWrite(
                                {
                                    namespace: 'test',
                                    uploadId: 'no-such-upload',
                                    body: Readable.from(
                                        Buffer.from('x'),
                                    ) as unknown as NodeJS.ReadableStream,
                                },
                                {} as IMeta,
                            ),
                        ),
                        'blob.notFound',
                        'an upload nobody prepared is refused',
                    );
                    assert.equal(
                        await refusalOf(() =>
                            blobUploadCommit(
                                {namespace: 'test', key: 'no-such-upload'},
                                {} as IMeta,
                            ),
                        ),
                        'blob.notFound',
                        'and so is committing one',
                    );
                    return {done: true};
                },

                async function aDiscardedUploadIsGone(assert: IAssert) {
                    const prepared = (await blobUploadPrepare(
                        {namespace: 'test', contentType: 'text/plain', filename: 'draft.txt'},
                        {} as IMeta,
                    )) as Prepared;
                    await blobUploadDiscard({namespace: 'test', key: prepared.key}, {} as IMeta);
                    const head = (await storageBlobHead(
                        {namespace: 'test', key: prepared.key},
                        {} as IMeta,
                    )) as IBlobMeta | null;
                    assert.equal(head, null, 'the record is removed');
                    assert.equal(
                        await refusalOf(() =>
                            blobUploadCommit({namespace: 'test', key: prepared.key}, {} as IMeta),
                        ),
                        'blob.notFound',
                        'and committing it again is refused the same way',
                    );
                    return {done: true};
                },
            ]),
    }),
);
