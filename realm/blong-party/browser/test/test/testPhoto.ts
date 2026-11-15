import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/** What `blob.scope.issue` answers. */
type Issued = {scopes: string[]; expiresIn: number};

/**
 * `test.photo` — the scope cookie a signed-in reader mints, over the gateway.
 *
 * The store is a companion of this suite, so the photograph a person sets is written and read
 * through it (`@@D-845`). Two halves have to hold before the portal shows a picture: the realm must
 * grant the minting method to the roles a reader holds — otherwise the gateway answers
 * `Authorization denied`, which no in-process test can see because the server-side flows never meet
 * the authorization list — and the mint must answer the caller's own scopes (`@@D-836`).
 *
 * This runs as a browser flow so every call crosses the real HTTP gateway: the point is the
 * authorization decision, not the handler.
 *
 * Registered as the `test.photo` group (`browser-test.ts`).
 */
export default handler(
    ({lib: {group}, handler: {loginTokenCreate, blobScopeIssue, blobStorageInfo}}) => ({
        testPhoto: ({name = 'photo scope'}: {name?: string} = {}) =>
            group(name)([
                // 1. A seeded user, whose role the realm's authorization seed now carries.
                async function signIn(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const token = await loginTokenCreate(
                        {username: 'testAdmin', password: 'testPassword'},
                        $meta,
                    );
                    assert.ok(token, 'the seeded administrator signs in');
                    return {done: true};
                },

                // 2. The mint answers instead of being refused, with the caller's own scope.
                async function issueCookie(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const issued = (await blobScopeIssue({}, $meta)) as Issued;
                    assert.ok(
                        issued.scopes.includes('authenticated'),
                        'a signed-in reader is granted the session scope',
                    );
                    assert.ok(issued.expiresIn > 0, 'the cookie has a lifetime');
                    return {scopes: issued.scopes};
                },

                // 3. The store this process carries is the one it was told to: the point of the child,
                //    proved from outside it (`@@D-845`).
                async function storeAnswers(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const info = (await blobStorageInfo({}, $meta)) as {backend?: string};
                    assert.equal(
                        info.backend,
                        'cacache',
                        'the party process serves the filesystem store',
                    );
                    return info;
                },
            ]),
    }),
);
