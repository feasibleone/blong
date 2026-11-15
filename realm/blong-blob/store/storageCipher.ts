import {Transform, type TransformCallback} from 'node:stream';
import {createCipheriv, createDecipheriv, randomBytes} from 'node:crypto';

import type {IBlobCrypto} from '@feasibleone/blong';

/**
 * AES-256-CBC over a stream, one random initial vector per blob.
 *
 * `ut-function.cbc` cannot serve a file: it pads the whole value and buffers it, so a 200 MiB upload
 * would be held in memory, and it carries one IV for every value it encrypts. The cipher here is the
 * same algorithm and the same key convention, but it is a `Transform`, and every blob names the IV it
 * was written with — a fixed IV under one key makes two equal files distinguishable, which is the one
 * thing an at-rest cipher must not do (@@D-846).
 */

/** The default algorithm and the IV length it takes. */
export const BLOB_CIPHER_ALGORITHM = 'aes-256-cbc';
export const BLOB_IV_BYTES = 16;

/** The key, as the config holds it: hex, one byte per two characters. */
export function cipherKey(keyHex: string | undefined): Buffer {
    if (!keyHex) {
        throw Object.assign(new Error('blob: no encryption key is configured'), {
            type: 'blob.cryptoUnconfigured',
        });
    }
    const key = Buffer.from(keyHex, 'hex');
    if (key.length !== 32) {
        throw Object.assign(
            new Error(`blob: the encryption key must be 32 bytes, got ${key.length}`),
            {type: 'blob.cryptoInvalid', length: key.length},
        );
    }
    return key;
}

/** A fresh initial vector, hex encoded the way the metadata holds it. */
export function newIv(bytes = BLOB_IV_BYTES): string {
    return randomBytes(bytes).toString('hex');
}

/** A pass-through that encrypts as the bytes go past. */
export function encryptStream(
    keyHex: string | undefined,
    algorithm = BLOB_CIPHER_ALGORITHM,
    ivHex = newIv(),
): {crypto: IBlobCrypto; stream: Transform} {
    const cipher = createCipheriv(algorithm, cipherKey(keyHex), Buffer.from(ivHex, 'hex'));
    return {
        crypto: {algorithm, iv: ivHex},
        stream: new Transform({
            transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
                try {
                    callback(null, cipher.update(chunk));
                } catch (error) {
                    callback(error as Error);
                }
            },
            flush(callback: TransformCallback) {
                try {
                    callback(null, cipher.final());
                } catch (error) {
                    callback(error as Error);
                }
            },
        }),
    };
}

/** A pass-through that decrypts the bytes a record says were encrypted with `crypto`. */
export function decryptStream(keyHex: string | undefined, crypto: IBlobCrypto): Transform {
    const decipher = createDecipheriv(
        crypto.algorithm,
        cipherKey(keyHex),
        Buffer.from(crypto.iv, 'hex'),
    );
    return new Transform({
        transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
            try {
                callback(null, decipher.update(chunk));
            } catch (error) {
                callback(
                    Object.assign(new Error('blob: content could not be decrypted'), {
                        type: 'blob.corrupt',
                        cause: error,
                    }),
                );
            }
        },
        flush(callback: TransformCallback) {
            try {
                callback(null, decipher.final());
            } catch (error) {
                callback(
                    Object.assign(new Error('blob: content ended mid-block'), {
                        type: 'blob.corrupt',
                        cause: error,
                    }),
                );
            }
        },
    });
}
