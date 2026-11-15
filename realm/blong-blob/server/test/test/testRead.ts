import {type IAssert, type IMeta, handler} from '@feasibleone/blong';
import {Readable} from 'node:stream';

/** What `blob.blob.add` answers. */
type Added = {key: string; uri: string; size: number; digest: string};

/** The refusal a call produced, as its error type: a passing test never prints a stack. */
async function refusalOf(call: () => unknown): Promise<string> {
    try {
        await call();
        return '';
    } catch (error) {
        return (error as {type?: string}).type ?? 'unknown';
    }
}

async function readAll(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
}

async function added(
    add: (params: object, $meta: IMeta) => unknown,
    content: string,
    contentType: string,
    scopes: string[],
): Promise<Added> {
    return (await add(
        {
            namespace: 'test',
            contentBase64: Buffer.from(content).toString('base64'),
            contentType,
            scopes,
        },
        {} as IMeta,
    )) as Added;
}

/**
 * `test.read` — what a serving route answers, and what it refuses.
 *
 * A reader arrives with a cookie rather than a token, so the scopes are the whole authorisation
 * (`@@D-836`). The headers are the gateway's to send, so what a step proves here is the part the route
 * decides from: the record it reads (type and plaintext length) and the bytes the stream yields. The
 * refusals are the two a caller can tell apart — a key that is not there, and a blob the caller's cookie
 * does not reach.
 *
 * Registered as the `test.read` group (`integration.watch.test` in index.ts).
 */
export default handler(({lib: {group}, handler: {blobBlobAdd, blobRead, blobBlobGet}}) => ({
    testRead: () =>
        group('read')([
            async function theAnswerCarriesWhatABrowserNeeds(assert: IAssert) {
                const blob = await added(blobBlobAdd, 'the bytes of a served file', 'text/plain', [
                    'anonymous',
                ]);
                // The record is what the route answers its headers from, and it is what a step can
                // see: `httpResponse` is applied by the gateway, so an in-process call does not
                // carry it back (the wire is covered by `test.scope` and the browser).
                const record = (await blobBlobGet(
                    {namespace: 'test', key: blob.key},
                    {} as IMeta,
                )) as {contentType: string; size: number};
                assert.ok(record.contentType.startsWith('text/plain'), 'the type the record named');
                assert.equal(
                    record.size,
                    blob.size,
                    'and the length of the plaintext, not of the ciphertext',
                );
                const body = await readAll(
                    (await blobRead({namespace: 'test', key: blob.key}, {} as IMeta)) as Readable,
                );
                assert.ok(
                    body.equals(Buffer.from('the bytes of a served file')),
                    'while the bytes are the file',
                );
                return blob;
            },

            async function aNamedDownloadIsAnswered(assert: IAssert) {
                // The disposition itself is the gateway's to send, so what a step can prove is that
                // the route accepts the name and still answers the bytes.
                const blob = await added(
                    blobBlobAdd,
                    'a file somebody downloads',
                    'application/pdf',
                    ['anonymous'],
                );
                const body = await readAll(
                    (await blobRead(
                        {namespace: 'test', key: blob.key, download: 'contract.pdf'},
                        {} as IMeta,
                    )) as Readable,
                );
                assert.ok(
                    body.equals(Buffer.from('a file somebody downloads')),
                    'a download answers the same bytes as a view',
                );
                return {done: true};
            },

            async function aMissingBlobIsNotFound(assert: IAssert) {
                assert.equal(
                    await refusalOf(() =>
                        blobRead({namespace: 'test', key: 'no-such-key'}, {} as IMeta),
                    ),
                    'blob.notFound',
                    'a key nobody wrote is not found',
                );
                assert.equal(
                    await refusalOf(() =>
                        blobBlobGet({namespace: 'test', key: 'no-such-key'}, {} as IMeta),
                    ),
                    'blob.notFound',
                    'and asking for its record says the same',
                );
                return {done: true};
            },

            async function aScopeTheCookieDoesNotReachIsRefused(assert: IAssert) {
                // 403 rather than 401: the caller is known, the scope is not (`@@D-836`).
                const blob = await added(blobBlobAdd, 'somebody else photograph', 'image/png', [
                    'party:person:1',
                ]);
                assert.equal(
                    await refusalOf(() =>
                        blobRead({namespace: 'test', key: blob.key}, {} as IMeta),
                    ),
                    'blob.scopeDenied',
                    'a blob whose scope the caller does not hold is refused',
                );
                return {done: true};
            },
        ]),
}));
