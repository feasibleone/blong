import {Transform} from 'node:stream';
import {createHash} from 'node:crypto';

/**
 * SHA-256 over the bytes as they pass, and a check that the bytes are the ones a record promised.
 *
 * AES-256-CBC does not authenticate: a flipped ciphertext bit decrypts into a flipped plaintext bit
 * with no error at all. The digest is what turns that into a refusal, so it is computed on the way in
 * and checked on the way out (@@D-839).
 */

/** A pass-through that reports the digest of what went through it. */
export interface IDigestTap {
    /** The transform to pipe the content through. */
    stream: Transform;
    /** Resolves with the hex digest once the last byte has passed. */
    result: Promise<string>;
}

/** Compute the digest of a stream without holding it. */
export function digestTap(): IDigestTap {
    const hash = createHash('sha256');
    let resolve: (digest: string) => void;
    let reject: (error: Error) => void;
    const result = new Promise<string>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    const stream = new Transform({
        transform(chunk, _encoding, callback) {
            hash.update(chunk);
            callback(null, chunk);
        },
        flush(callback) {
            try {
                resolve(hash.digest('hex'));
                callback();
            } catch (error) {
                reject(error as Error);
                callback(error as Error);
            }
        },
    });
    stream.on('error', error => reject(error));
    return {stream, result};
}

/**
 * Fail the stream when the bytes do not hash to `expected`.
 *
 * The check happens at the end of the stream, which is the only point at which it can: the plaintext
 * has already been handed to the caller, so the strongest honest answer is a destroyed stream rather
 * than a wrong file with a 200.
 */
export function digestVerify(expected: string): Transform {
    if (!expected) {
        return new Transform({
            transform(chunk, _encoding, callback) {
                callback(
                    Object.assign(new Error('blob: the record carries no digest to check'), {
                        type: 'blob.corrupt',
                    }),
                );
            },
        });
    }
    const hash = createHash('sha256');
    return new Transform({
        transform(chunk, _encoding, callback) {
            hash.update(chunk);
            callback(null, chunk);
        },
        flush(callback) {
            const actual = hash.digest('hex');
            if (actual === expected) return callback();
            callback(
                Object.assign(
                    new Error(`blob: content does not match its digest (${actual} ≠ ${expected})`),
                    {type: 'blob.corrupt', expected, actual},
                ),
            );
        },
    });
}
