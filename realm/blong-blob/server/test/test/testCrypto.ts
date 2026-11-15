import {type IAssert, type IMeta, handler} from '@feasibleone/blong';
import {Readable} from 'node:stream';

import type {IBlobMeta} from '@feasibleone/blong';

/** What `blob.blob.add` answers; the proxy types a handler call as `unknown`. */
type Added = {key: string; uri: string; size: number; digest: string};

/** Everything back, so a stream is compared rather than inspected. */
async function readAll(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
}

/** The refusal a call produced, as its error type: a passing test never prints a stack. */
async function refusalOf(call: () => unknown): Promise<string> {
    try {
        await call();
        return '';
    } catch (error) {
        return (error as {type?: string}).type ?? 'unknown';
    }
}

/**
 * `test.crypto` — a blob is stored encrypted, with a digest that catches what encryption cannot.
 *
 * CBC is not an authenticating mode, so a flipped byte decrypts into garbage rather than failing, and
 * the digest recorded beside the record is what turns that into a refusal (`@@D-839`). The two blobs
 * written with the same plaintext are what proves the IV is per blob: identical ciphertext would mean a
 * fixed one, and a store where two equal files are visibly equal.
 *
 * Registered as the `test.crypto` group (`integration.watch.test` in index.ts).
 */
export default handler(
    ({
        lib: {group},
        handler: {blobBlobAdd, blobRead, storageBlobHead, storageBlobGet, storageBlobMetaPut},
    }) => ({
        testCrypto: () =>
            group('crypto')([
                async function aRoundTripAnswersThePlaintext(assert: IAssert) {
                    const content = Buffer.from('the bytes a reader asked for');
                    const added = (await blobBlobAdd(
                        {
                            namespace: 'test',
                            contentBase64: content.toString('base64'),
                            contentType: 'text/plain',
                            scopes: ['anonymous'],
                        },
                        {} as IMeta,
                    )) as Added;
                    const read = (await blobRead(
                        {namespace: 'test', key: added.key},
                        {} as IMeta,
                    )) as Readable;
                    const back = await readAll(read);
                    assert.ok(back.equals(content), 'the plaintext comes back');
                    assert.equal(added.size, content.length, 'the record names the plaintext size');
                    assert.equal(
                        added.digest,
                        (
                            (await storageBlobHead(
                                {namespace: 'test', key: added.key},
                                {} as IMeta,
                            )) as IBlobMeta | null
                        )?.digest,
                        'the digest is the one the record carries',
                    );
                    return added;
                },

                async function theStoredBytesAreNotThePlaintext(
                    assert: IAssert,
                    {
                        aRoundTripAnswersThePlaintext: roundTrip,
                    }: {aRoundTripAnswersThePlaintext: Promise<Added>},
                ) {
                    // The store's own answer, not the read path's: a read that decrypted twice would
                    // hide a plaintext at rest.
                    const {key} = await roundTrip;
                    const stored = (await storageBlobGet(
                        {namespace: 'test', key},
                        {} as IMeta,
                    )) as {meta: IBlobMeta; stream: Readable} | null;
                    assert.ok(stored, 'the record is readable from the store');
                    if (!stored) return {done: false};
                    const raw = await readAll(stored.stream);
                    assert.ok(
                        !raw.includes(Buffer.from('the bytes a reader asked for')),
                        'the bytes at rest are not the plaintext',
                    );
                    assert.ok(stored.meta.crypto, 'the record says how it was encrypted');
                    assert.equal(
                        stored.meta.crypto?.algorithm,
                        'aes-256-cbc',
                        'with the algorithm',
                    );
                    assert.ok(stored.meta.crypto?.iv, 'and an IV of its own');
                    return stored.meta;
                },

                async function twoEqualFilesAreEncryptedDifferently(assert: IAssert) {
                    // One IV per blob: a fixed one would make two equal files identical at rest, which
                    // is a store that leaks what it holds.
                    const content = Buffer.from('the same bytes twice').toString('base64');
                    const first = (await blobBlobAdd(
                        {
                            namespace: 'test',
                            contentBase64: content,
                            contentType: 'text/plain',
                            scopes: ['anonymous'],
                        },
                        {} as IMeta,
                    )) as Added;
                    const second = (await blobBlobAdd(
                        {
                            namespace: 'test',
                            contentBase64: content,
                            contentType: 'text/plain',
                            scopes: ['anonymous'],
                        },
                        {} as IMeta,
                    )) as Added;
                    assert.equal(
                        first.digest,
                        second.digest,
                        'the digests of equal plaintexts match',
                    );
                    const iv = async (key: string) =>
                        (
                            (await storageBlobHead(
                                {namespace: 'test', key},
                                {} as IMeta,
                            )) as IBlobMeta | null
                        )?.crypto?.iv;
                    assert.notEqual(await iv(first.key), await iv(second.key), 'the IVs differ');
                    return {done: true};
                },

                async function aRecordWhoseDigestIsWrongIsRefused(assert: IAssert) {
                    // The store keeps the digest of the plaintext, and a corrupted ciphertext decrypts
                    // into something the digest does not match. Rewriting the digest is how a test
                    // stands where a flipped byte would be (`@@D-839`).
                    const added = (await blobBlobAdd(
                        {
                            namespace: 'test',
                            contentBase64: Buffer.from('a file somebody tampered with').toString(
                                'base64',
                            ),
                            contentType: 'text/plain',
                            scopes: ['anonymous'],
                        },
                        {} as IMeta,
                    )) as Added;
                    const meta = (await storageBlobHead(
                        {namespace: 'test', key: added.key},
                        {} as IMeta,
                    )) as IBlobMeta;
                    await storageBlobMetaPut(
                        {
                            namespace: 'test',
                            key: added.key,
                            metadata: {...meta, digest: 'a99f'.repeat(16)},
                        },
                        {} as IMeta,
                    );
                    // The digest is checked as the bytes go past, so the refusal arrives when the
                    // stream is consumed rather than when the call is made.
                    assert.equal(
                        await refusalOf(async () => {
                            const stream = (await blobRead(
                                {namespace: 'test', key: added.key},
                                {} as IMeta,
                            )) as Readable;
                            await readAll(stream);
                        }),
                        'blob.corrupt',
                        'a digest that does not match the plaintext is a refusal, not a wrong file',
                    );
                    return {done: true};
                },
            ]),
    }),
);
