import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

import {blobScopeSign} from '../../../blob/blobScope.ts';
import {BLOB_TEST_COOKIE_SECRET} from '../../../testConfig.ts';

/** What `blob.blob.add` answers; the proxy types a handler call as `unknown`. */
type Added = {key: string};

/** What `blob.scope.issue` answers. */
type Issued = {scopes: string[]; expiresIn: number};

const COOKIE = 'blob.blob';

/** A request as the gateway would hand it over: the cookie arrives in `httpRequest.state`. */
const withCookie = (value: string): IMeta =>
    ({httpRequest: {state: {[COOKIE]: value}}}) as unknown as IMeta;

async function outcome(answer: unknown): Promise<'served' | 'refused'> {
    return Promise.resolve(answer).then(
        () => 'served' as const,
        () => 'refused' as const,
    );
}

async function addScoped(
    add: (params: object, $meta: IMeta) => unknown,
    scopes: string[],
    content: string,
): Promise<string> {
    const added = (await add(
        {
            namespace: 'test',
            contentBase64: Buffer.from(content).toString('base64'),
            contentType: 'image/png',
            scopes,
        },
        {} as IMeta,
    )) as Added;
    return added.key;
}

/**
 * `test.scope` — the read cookie decides who may read what, through the real port.
 *
 * The three cases are the three a browser meets: a page that has just logged in issues itself a
 * cookie, an image on the login page is `anonymous` and needs none, and a photograph belonging to
 * somebody else is refused with a 403 rather than a 401 — the caller is known, the scope is not
 * (@@D-836). A tampered cookie is refused the same way an absent one is, because a verification
 * failure is not an error to report but a caller that holds no scopes.
 *
 * Registered as the `test.scope` group (`integration.watch.test` in index.ts).
 */
export default handler(({lib: {group}, handler: {blobBlobAdd, blobRead, blobScopeIssue}}) => ({
    testScope: () =>
        group('scope')([
            async function anonymousBlobNeedsNoCookie(assert: IAssert) {
                const key = await addScoped(blobBlobAdd, ['anonymous'], 'a login page logo');
                const answer = await outcome(blobRead({namespace: 'test', key}, {} as IMeta));
                assert.equal(answer, 'served', 'an anonymous blob is served with no cookie');
                return {done: true};
            },

            async function aScopedBlobNeedsTheScopeItNames(assert: IAssert) {
                const key = await addScoped(blobBlobAdd, ['party:person:1'], 'a person photograph');
                const denied = await outcome(blobRead({namespace: 'test', key}, {} as IMeta));
                assert.equal(denied, 'refused', 'without a cookie the scoped blob is refused');

                const issued = (await blobScopeIssue({scopes: ['party:person:1']}, {
                    auth: {actorId: 'actor-1'},
                } as unknown as IMeta)) as Issued;
                assert.ok(
                    issued.scopes.includes('party:person:1'),
                    'the issued scopes include the one asked for',
                );
                assert.ok(
                    issued.scopes.includes('authenticated'),
                    'and mark the caller as authenticated',
                );
                assert.ok(issued.expiresIn > 0, 'with a lifetime');
                return {done: true};
            },

            async function theCookieTheRealmSignsIsWhatOpensTheBlob(assert: IAssert) {
                const key = await addScoped(blobBlobAdd, ['sport:club:3'], 'a club crest');
                const exp = Math.floor(Date.now() / 1000) + 60;
                const value = blobScopeSign(
                    {actorId: 'actor-1', scopes: ['sport:club:3'], exp},
                    BLOB_TEST_COOKIE_SECRET,
                );
                const served = await outcome(blobRead({namespace: 'test', key}, withCookie(value)));
                assert.equal(served, 'served', 'a cookie for the blob’s scope opens it');

                const tampered = await outcome(
                    blobRead({namespace: 'test', key}, withCookie(`${value.slice(0, -2)}xx`)),
                );
                assert.equal(tampered, 'refused', 'a tampered cookie counts as no cookie');

                const expired = blobScopeSign(
                    {actorId: 'actor-1', scopes: ['sport:club:3'], exp: 1},
                    BLOB_TEST_COOKIE_SECRET,
                );
                const stale = await outcome(
                    blobRead({namespace: 'test', key}, withCookie(expired)),
                );
                assert.equal(stale, 'refused', 'and so does an expired one');
                return {done: true};
            },
        ]),
}));
