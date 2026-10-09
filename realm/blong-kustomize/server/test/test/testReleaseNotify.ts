import {type IAssert, type IMeta, handler} from '@feasibleone/blong';
import {realmCommand} from '../../../bin/kustomizeCommand.ts';
import {releasePatch} from '../../../orchestrator/controller/kustomizeReleaseNotify.ts';

/**
 * server/test/test/testReleaseNotify.ts — a release announcing itself to a cluster.
 *
 * A release publishes an image and an artifact, and the realm's job is to tell a cluster about them
 * through the declaration it already holds. Which seam it tells *is* the decision (Q9): a cluster
 * whose operator watches a CR wants the patch, a cluster whose operator watches a repository wants
 * the GitOps push, and doing both would mean two operators converging on one suite — so the GitOps
 * seam is consulted first and wins when a target is configured.
 *
 * Nothing here needs a cluster, and that shapes what can be asserted: what a unit run reaches is the
 * *answer* — which seam ran, and why the other did not — while the patch itself is exercised where
 * the cluster is (section K). The GitOps seam is part of this realm, so its refusal is a real one
 * from the configured state, not a stub's.
 *
 * Registered as the `test.release.notify` group (`integration.watch.test` in `index.ts`).
 */
export default handler(({lib: {group}, handler: {kustomizeReleaseNotify}}) => ({
    testReleaseNotify: ({name = 'release notify'}: {name?: string} = {}) =>
        group(name)([
            async function theReportingSaysWhichSeamRan(assert: IAssert, {$meta}: {$meta: IMeta}) {
                const answer = (await kustomizeReleaseNotify(
                    {
                        suite: 'blong-suite',
                        version: '1.13.0',
                        artifactUrl: 'https://example.test/a.tgz',
                    },
                    $meta,
                )) as {
                    updated: boolean;
                    gitops: {pushed: boolean; reason?: string};
                    reason?: string;
                };
                assert.equal(
                    answer.gitops.pushed,
                    false,
                    'the gitops seam is asked first, so a cluster with one operator is not told twice',
                );
                assert.match(
                    String(answer.gitops.reason),
                    /no gitops target/,
                    'and it refuses for the configured reason rather than a missing module',
                );
                assert.equal(
                    answer.updated,
                    false,
                    'and nothing is written when the rest of the announcement cannot be made',
                );
                assert.ok(
                    typeof answer.reason === 'string' && answer.reason.length > 0,
                    'the answer says why, which is what a caller reporting to a user needs',
                );
            },

            async function thePatchTouchesMembersAndNotTheirParents(assert: IAssert) {
                // `add` replaces the member it names, so the path is the whole contract: `/spec/version`
                // and `/spec/suiteVolume/artifact` change one field each, where `/spec/suiteVolume`
                // would replace the volume — a release would then reset `backend` and `retention` to the
                // CRD's defaults, and a node-local suite became `auto` because a release happened. The
                // live run that found this was the CI job's own notify step, rehearsed against the dev
                // cluster (T-247).
                assert.deepEqual(
                    releasePatch({version: '1.13.0'}),
                    [{op: 'add', path: '/spec/version', value: '1.13.0'}],
                    'a release that only announces a version patches one member',
                );
                assert.deepEqual(
                    releasePatch({
                        version: '1.13.0',
                        artifactUrl: 'https://example.test/suite.zip',
                    }),
                    [
                        {op: 'add', path: '/spec/version', value: '1.13.0'},
                        {
                            op: 'add',
                            path: '/spec/suiteVolume/artifact',
                            value: {source: 'url', url: 'https://example.test/suite.zip'},
                        },
                    ],
                    'and the artifact is patched *inside* the volume, never over it',
                );
                assert.deepEqual(
                    releasePatch({
                        version: '1.13.0',
                        frameworkImage: 'ghcr.io/feasibleone/blong-gogo',
                    }).map(operation => operation.path),
                    ['/spec/version', '/spec/frameworkImage'],
                    'the image only when the release moved it',
                );
            },

            async function theRealmCliNamesTheTwoDecisions(assert: IAssert) {
                // The CLI is a naming layer: it exists so a release can be announced, and so the
                // retention decision has a caller at all. What is worth pinning is the mapping — the
                // command line, the method it names, and the params it passes — because a parameter
                // that arrives empty is not the same as one that was not given, and the handlers
                // depend on the difference.
                const args = (positionals: string[], argv: Record<string, unknown> = {}) =>
                    realmCommand({argv: argv as never, positionals});

                const notify = args(['release-notify'], {
                    suite: 'shop',
                    version: '1.13.0',
                    'artifact-url': 'https://example.test/suite.zip',
                });
                assert.equal(
                    notify?.method,
                    'kustomizeReleaseNotify',
                    'the release command names the notify handler',
                );
                assert.deepEqual(
                    notify?.params,
                    {
                        suite: 'shop',
                        version: '1.13.0',
                        artifactUrl: 'https://example.test/suite.zip',
                    },
                    'and passes only what was given, camel-cased',
                );
                assert.deepEqual(
                    args(['release-notify'], {suite: 'shop', version: '1'})?.params,
                    {suite: 'shop', version: '1'},
                    'an absent artifact is absent rather than empty',
                );

                assert.equal(
                    args(['volume-prune'], {retention: 5})?.method,
                    'kustomizeVolumePrune',
                    'the prune command names the retention decision',
                );
                assert.deepEqual(
                    args(['volume-prune', '--retention=5'], {retention: 5})?.params,
                    {retention: 5},
                    'with the retention when it is asked for',
                );
                assert.deepEqual(
                    args(['volume-prune'], {retention: 'many'})?.params,
                    {},
                    'and left to the handler\u2019s own default when it is not a number',
                );

                assert.equal(
                    args(['something-else']),
                    undefined,
                    'an unknown command is no call at all, which is a usage error upstream',
                );
            },

            async function aReleaseWithNothingToSayWritesNothing(
                assert: IAssert,
                {$meta}: {$meta: IMeta},
            ) {
                const answer = (await kustomizeReleaseNotify({suite: '', version: ''}, $meta)) as {
                    updated: boolean;
                    reason?: string;
                };
                assert.equal(
                    answer.updated,
                    false,
                    'an announcement without a suite is not a patch',
                );
                assert.ok(
                    typeof answer.reason === 'string' && answer.reason.length > 0,
                    'and it is answered rather than thrown: a release calls this over an API',
                );
            },
        ]),
}));
