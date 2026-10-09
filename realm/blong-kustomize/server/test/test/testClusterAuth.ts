import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/**
 * server/test/test/testClusterAuth.ts — the two identity questions, asked of a real cluster.
 *
 * A TokenReview is "whose token is this?" and a SubjectAccessReview is "may that identity do
 * this?" — the pair the deployment UI's login depends on (Phase 13 A). Neither can be answered
 * without a cluster, so this group **skips itself** unless `BLONG_TEST_TOKEN` is set:
 *
 *     BLONG_TEST_TOKEN="$(kubectl create token default -n default)" node --run test
 *
 * The check that matters is not that the calls work but that the *cluster* is the one deciding:
 * the first review reports the identity the token belongs to, and the second reports that a
 * service account nobody granted anything holds no rights, rather than this realm guessing either
 * answer.
 *
 * Registered as the `test.cluster.auth` group (`integration.watch.test` in `index.ts`).
 */
export default handler(
    ({lib: {group}, handler: {clusterToken_ReviewCreate, clusterSubject_Access_ReviewCreate}}) => ({
        testClusterAuth: ({name = 'cluster auth'}: {name?: string} = {}) =>
            group(name)([
                async function asksWhoTheTokenIs(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const token = process.env.BLONG_TEST_TOKEN;
                    if (!token) {
                        return {
                            skipped:
                                'set BLONG_TEST_TOKEN to a service-account token to run this against a cluster',
                        };
                    }
                    const review = (await clusterToken_ReviewCreate(
                        {
                            body: {
                                apiVersion: 'authentication.k8s.io/v1',
                                kind: 'TokenReview',
                                spec: {token},
                            },
                        },
                        $meta,
                    )) as {
                        status?: {
                            authenticated?: boolean;
                            user?: {username?: string; groups?: string[]};
                        };
                    };
                    assert.equal(
                        review?.status?.authenticated,
                        true,
                        'the cluster authenticates the token',
                    );
                    assert.ok(
                        review?.status?.user?.username,
                        'the review names the identity the token belongs to',
                    );
                    return {username: review?.status?.user?.username};
                },

                async function asksWhatThatIdentityMayDo(
                    assert: IAssert,
                    {
                        $meta,
                        asksWhoTheTokenIs: reviewed,
                    }: {
                        $meta: IMeta;
                        asksWhoTheTokenIs: Promise<{username?: string; skipped?: string}>;
                    },
                ) {
                    const who = await reviewed;
                    if (who?.skipped) return who;
                    const review = (await clusterSubject_Access_ReviewCreate(
                        {
                            body: {
                                apiVersion: 'authorization.k8s.io/v1',
                                kind: 'SubjectAccessReview',
                                spec: {
                                    user: who.username,
                                    resourceAttributes: {
                                        group: 'blong.feasible.one',
                                        resource: 'blongdeployments',
                                        verb: 'create',
                                    },
                                },
                            },
                        },
                        $meta,
                    )) as {status?: {allowed?: boolean; reason?: string}};
                    // The default service account has been granted nothing, so the answer is no —
                    // and the answer comes from the cluster's RBAC, which is the whole point of
                    // asking it rather than keeping a permission list here.
                    assert.equal(
                        review?.status?.allowed,
                        false,
                        'an identity nobody granted anything may not reconcile',
                    );
                    assert.ok(
                        typeof review?.status?.reason === 'string' ||
                            review?.status?.allowed === false,
                        'the cluster answers with a subject access review, not a guess',
                    );
                    return {username: who.username, allowed: review?.status?.allowed};
                },
            ]),
    }),
);
