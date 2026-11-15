import {Transform} from 'node:stream';

/**
 * Drop the bytes before `start` and stop after `end`.
 *
 * The read path decrypts and then slices, so a range costs the work of decrypting what came before it
 * and none of sending it — the alternative, a separate cipher state per offset, would need the IV at
 * a block boundary and an index of them (@@D-836).
 */
export function blobSlice(start: number, end: number): Transform {
    let position = 0;
    return new Transform({
        transform(chunk: Buffer, _encoding, callback) {
            const begin = position;
            position += chunk.length;
            if (position <= start || begin > end) {
                // Entirely before the window, or entirely after it.
                return callback(null, position <= start ? undefined : Buffer.alloc(0));
            }
            const from = Math.max(0, start - begin);
            const to = Math.min(chunk.length, end - begin + 1);
            callback(null, chunk.subarray(from, to));
        },
    });
}
