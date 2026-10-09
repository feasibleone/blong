// cspell:ignore serviceaccount
import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/**
 * What the login answers. The gateway validation leaves the result open on purpose — it is the
 * portal's token response, whose shape belongs to the browser side — so the test narrows it here
 * rather than the realm declaring a second version of a contract it does not own.
 */
type LoginResult = {
    access_token?: string;
    permissions?: string[];
    profile?: {username?: string};
};

/**
 * server/test/test/testLogin.ts — the login the cluster answers.
 *
 * Two things are worth proving here and neither needs a user table: a token the cluster does not
 * recognise is refused, and a token it does recognise comes back with the identity the cluster
 * named and the verdict of its RBAC. Like `test.cluster.auth` this group **skips itself** unless
 * `BLONG_TEST_TOKEN` is set:
 *
 *     BLONG_TEST_TOKEN="$(kubectl create token default -n default)" node --run test
 *
 * Registered as the `test.login` group (`integration.watch.test` in `index.ts`).
 */
export default handler(({lib: {group}, handler: {loginTokenCreate}}) => ({
    testLogin: ({name = 'login'}: {name?: string} = {}) =>
        group(name)([
            async function refusesATokenTheClusterDoesNotKnow(
                assert: IAssert,
                {$meta}: {$meta: IMeta},
            ) {
                const token = process.env.BLONG_TEST_TOKEN;
                if (!token) {
                    return {
                        skipped:
                            'set BLONG_TEST_TOKEN to a service-account token to run this against a cluster',
                    };
                }
                const attempt = loginTokenCreate(
                    {username: 'ignored', password: 'not-a-token'},
                    $meta,
                ) as Promise<LoginResult>;
                const failure = await attempt.then(
                    () => undefined,
                    (error: unknown) => error as Error,
                );
                assert.ok(failure, 'a token the cluster does not recognise is refused');
                return {token};
            },

            async function acceptsATokenTheClusterKnows(
                assert: IAssert,
                {
                    $meta,
                    refusesATokenTheClusterDoesNotKnow: refused,
                }: {
                    $meta: IMeta;
                    refusesATokenTheClusterDoesNotKnow: Promise<{token?: string; skipped?: string}>;
                },
            ) {
                const {token, skipped} = await refused;
                if (skipped || !token) return {skipped};

                const result = (await loginTokenCreate(
                    {username: 'ignored', password: token},
                    $meta,
                )) as LoginResult;
                assert.equal(
                    result?.access_token,
                    token,
                    'the login hands back the token the portal will send as the bearer',
                );
                assert.ok(
                    Array.isArray(result?.permissions),
                    'and what the cluster says the identity may reconcile',
                );
                assert.match(
                    String(result?.profile?.username),
                    // The name comes from the TokenReview, not from the form: a token minted for
                    // a service account resolves to that account's clustered identity, while the
                    // form sent `ignored`.
                    /^system:serviceaccount:/,
                    'and the name the cluster gave it, not the one the form sent',
                );
                return {username: result.profile?.username, permissions: result.permissions};
            },
        ]),
}));
