import t from 'tap';
import {Readable, Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';

import {decryptStream, encryptStream, newIv} from './storageCipher.ts';

/** A key of the length AES-256 takes, and a wrong one to refuse. */
const KEY = '130a3f71f4f8560e786ff4c8839fecde6273b94b54ced6efbd0cec5281b4471a';

/** Push `content` through one transform and collect what comes out. */
async function through(stream: Transform, content: Buffer): Promise<Buffer> {
    const out: Buffer[] = [];
    await pipeline(
        Readable.from(content),
        stream,
        async function* (source: AsyncIterable<Buffer>) {
            for await (const chunk of source) out.push(chunk);
        },
    );
    return Buffer.concat(out);
}

t.test('a blob round-trips through the cipher at every block shape', async t => {
    for (const size of [1, 16, 1024 * 1024]) {
        const content = Buffer.alloc(size, 9);
        const {crypto, stream} = encryptStream(KEY);
        const ciphertext = await through(stream, content);
        t.ok(ciphertext.length > content.length, `${size} bytes grew by their padding block`);
        t.notOk(ciphertext.equals(content), `${size} bytes are not stored in the clear`);
        const back = await through(decryptStream(KEY, crypto), ciphertext);
        t.ok(back.equals(content), `${size} bytes come back unchanged`);
    }
});

t.test('two identical files do not produce the same ciphertext', async t => {
    const content = Buffer.from('the same bytes twice');
    const first = encryptStream(KEY);
    const second = encryptStream(KEY);
    t.ok(first.crypto.iv !== second.crypto.iv, 'each blob names its own initial vector');
    const a = await through(first.stream, content);
    const b = await through(second.stream, content);
    t.notOk(a.equals(b), 'so the ciphertexts differ');
    t.ok((await through(decryptStream(KEY, first.crypto), a)).equals(content), 'both decrypt');
    t.ok((await through(decryptStream(KEY, second.crypto), b)).equals(content), 'to what they held');
});

t.test('the wrong key does not quietly answer something else', async t => {
    const {crypto, stream} = encryptStream(KEY);
    const ciphertext = await through(stream, Buffer.from('the bytes a record promised'));
    const caught = await through(decryptStream('00'.repeat(32), crypto), ciphertext).catch(
        (error: {type?: string}) => error,
    );
    t.equal((caught as {type?: string})?.type, 'blob.corrupt', 'the read fails rather than guessing');
});

t.test('a key that is absent or the wrong length is refused at the edge', async t => {
    t.throws(() => encryptStream('00ff'), 'a short key is refused');
    let refused: {type?: string} | undefined;
    try {
        encryptStream(undefined);
    } catch (error) {
        refused = error as {type?: string};
    }
    t.equal(refused?.type, 'blob.cryptoUnconfigured', 'a missing key is not defaulted');
    t.equal(newIv().length, 32, 'an initial vector is 16 bytes, hex encoded');
});
