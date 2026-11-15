import type {IBlobCrypto, IBlobMeta} from '@feasibleone/blong';
import {library} from '@feasibleone/blong';
import type {Readable, Transform} from 'node:stream';

import {BLOB_DEFAULTS} from '../../blob/blobConfig.ts';
import {blobServe, type IServeInput, type IServeResult} from '../../blob/blobServe.ts';
import type {IBlobSettings} from '../../blob/blobSettings.ts';
import {decryptStream, encryptStream} from '../../store/storageCipher.ts';
import {digestTap, digestVerify, type IDigestTap} from '../../store/storageDigest.ts';

/**
 * The cipher and the digest, bound to the realm's key.
 *
 * They live in the orchestrator rather than beside the store because the key is a decision of the
 * realm — the store is a directory and a metadata record and knows nothing about encryption — and
 * because the record's `crypto` field is what a reader uses to undo it (@@D-846).
 */
export interface IBlobLib {
    /** Encrypt as the bytes go past, answering the `crypto` the record must keep. */
    blobEncrypt: (
        next: IBlobCryptoSettings,
        ivHex?: string,
    ) => {crypto: IBlobCrypto; stream: Transform};
    /** Decrypt what a record says it was written with. */
    blobDecrypt: (next: IBlobCryptoSettings, crypto: IBlobCrypto) => Transform;
    /** SHA-256 over the bytes as they pass. */
    blobDigest: () => IDigestTap;
    /** Refuse a stream whose bytes do not hash to `expected`. */
    blobDigestVerify: (expected: string) => Transform;
    /** Build the answer a read route sends, from the record and the store. */
    blobServeAnswer: (
        input: IServeInput,
        next: IBlobCryptoSettings,
        headOnly?: boolean,
    ) => Promise<IServeResult>;
}

/** The part of the settings the cipher needs: the key and the algorithm that used it. */
export type IBlobCryptoSettings = IBlobSettings['crypto'];

export default library(({handler}: {handler?: Record<string, unknown>}) => {
    const call = (name: string, params: object): Promise<unknown> =>
        (handler?.[name] as (p: object, m: object) => Promise<unknown>)(params, {});
    return {
        blobEncrypt: (next: IBlobCryptoSettings, ivHex?: string) =>
            encryptStream(next?.key, next?.algorithm ?? BLOB_DEFAULTS.algorithm, ivHex),
        blobDecrypt: (next: IBlobCryptoSettings, crypto: IBlobCrypto) =>
            decryptStream(next?.key, crypto),
        blobDigest: digestTap,
        blobDigestVerify: digestVerify,
        blobServeAnswer: (
            input: IServeInput,
            next: IBlobCryptoSettings,
            headOnly: boolean = false,
        ) =>
            blobServe(
                input,
                {
                    head: async (namespace, key) =>
                        (await call('storageBlobHead', {namespace, key})) as IBlobMeta | null,
                    get: async (namespace, key) =>
                        (await call('storageBlobGet', {namespace, key})) as {
                            meta: IBlobMeta;
                            stream: Readable;
                        } | null,
                    decrypt: (crypto: IBlobCrypto) => decryptStream(next?.key, crypto),
                    verify: digestVerify,
                },
                headOnly,
            ),
    };
});
