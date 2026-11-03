import {handler, type IAssert, type IMeta} from '@feasibleone/blong';
import {realmCommand} from '../../../bin/kustomizeCommand.ts';
import {
    releaseMarkdown,
    releasePatch,
    type IReleaseReport,
} from '../../../orchestrator/controller/kustomizeReleaseNotify.ts';

/**
 * server/test/test/testReleaseNotify.ts — a release announcing itself to a cluster; the answer says
 * which seam ran, and only a cluster exercises the patch itself.
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
                    markdown: string;
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
                assert.match(
                    answer.markdown,
                    /^### Release deploy — `blong-suite` `1\.13\.0`/,
                    'and the same answer carries the summary a workflow or a channel posts (@@D-751)',
                );
                assert.match(
                    answer.markdown,
                    /\*\*Result:\*\* not applied/,
                    'including the verdict, which is the line a reader scans for',
                );
            },

            async function theSummaryNamesWhatTheReleaseMoved(assert: IAssert) {
                // One rendering, two readers (@@D-751): a job summary renders tables, a chat channel
                // does not, so the document is a bullet list and every value is quoted. What is worth
                // pinning is the content a person acts on — the version it moved between, what the
                // artifact was, and what the pass did.
                const summary = releaseMarkdown({
                    suite: 'blong-suite',
                    version: '1.17.0',
                    previousVersion: '1.16.0',
                    namespace: 'blong-suite',
                    seam: 'cr',
                    updated: true,
                    changed: [
                        {
                            field: 'Artifact',
                            value: '`suite.zip` at `sha256:d377817e8e0e…`',
                        },
                    ],
                } as IReleaseReport);
                assert.match(
                    summary,
                    /^### Release deploy — `blong-suite` `1\.16\.0` → `1\.17\.0`/,
                    'the title states the move, which is the one thing a release is about',
                );
                assert.match(
                    summary,
                    /- \*\*Result:\*\* applied/,
                    'the verdict is a line of its own',
                );
                assert.match(
                    summary,
                    /- \*\*Artifact:\*\* `suite\.zip` at `sha256:d377817e8e0e…`/,
                    'and the artifact is named as a reader knows it, with the digest that names its volume',
                );
                assert.doesNotMatch(
                    summary,
                    /- \*\*Version:\*\*/,
                    'the version is not repeated below the title',
                );

                const operator = releaseMarkdown({
                    suite: 'blong-operator',
                    version: '0.5.0',
                    namespace: 'blong-system',
                    seam: 'operator',
                    updated: true,
                    changed: [],
                    pass: {
                        created: 2,
                        updated: 1,
                        unchanged: 4,
                        obsolete: 5,
                        deleted: 1,
                        skipped: 7,
                        failures: [{key: 'blong-system/job', message: 'the step did not finish'}],
                    },
                } as IReleaseReport);
                assert.match(
                    operator,
                    /- \*\*Pass:\*\* 2 created, 1 updated, 4 unchanged, 5 obsolete, 1 deleted, 7 install-owned left to the install, 1 failed/,
                    'an operator release reports what its own pass did, the skipped kinds included',
                );
                assert.match(
                    operator,
                    /- \*\*Failed:\*\* `blong-system\/job` — the step did not finish/,
                    'and names a failed step rather than only counting it',
                );
            },

            async function thePatchTouchesMembersAndNotTheirParents(assert: IAssert) {
                // `add` replaces the member it names, so the path is the whole contract: `/spec/version`
                // and `/spec/suiteVolume/artifact` change one field each, where `/spec/suiteVolume`
                // would replace the volume — a release would then reset `backend` and `retention` to the
                // CRD's defaults, and a node-local suite became `auto` because a release happened. The
                // live run that found this was the CI job's own notify step, rehearsed against the dev
                // cluster .
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
                assert.deepEqual(
                    releasePatch({
                        version: '1.13.0',
                        artifactUrl: 'https://example.test/sport.zip',
                        artifactDigest: 'a'.repeat(64),
                        frameworkVersion: '1.42.0',
                    }),
                    [
                        {op: 'add', path: '/spec/version', value: '1.13.0'},
                        {op: 'add', path: '/spec/minFrameworkVersion', value: '1.42.0'},
                        {
                            op: 'add',
                            path: '/spec/suiteVolume/artifact',
                            value: {
                                source: 'url',
                                url: 'https://example.test/sport.zip',
                                digest: 'a'.repeat(64),
                            },
                        },
                    ],
                    'the digest travels inside the artifact and the framework version is its own member',
                );
            },

            async function theOperatorsOwnReleaseIsAnsweredByAPass(
                assert: IAssert,
                {$meta}: {$meta: IMeta},
            ) {
                // There is no CR for the operator to patch, so its own release is answered by the
                // pass that writes its install tree — a registry pass, with the release's facts
                // (@@D-750). This process is not the operator (its config names no suite entry), so
                // the pass refuses for that reason: what the step pins is the *routing*, because a
                // release that reached the patch branch would answer "no BlongDeployment
                // blong-operator" and roll nothing.
                const answer = (await kustomizeReleaseNotify(
                    {
                        suite: 'blong-operator',
                        version: '0.5.0',
                        artifactUrl: 'https://example.test/blong-kustomize-0.5.0.zip',
                        artifactDigest: 'a'.repeat(64),
                        frameworkImage: 'ghcr.io/feasibleone/blong-gogo',
                        frameworkVersion: 'v1.42.0',
                    },
                    $meta,
                )) as {
                    updated: boolean;
                    reason?: string;
                    pass?: {applied?: boolean; reason?: string};
                };
                assert.ok(answer.pass, 'the announcement is answered by the reconcile pass');
                assert.match(
                    String(answer.pass?.reason),
                    /declares no suite entry/,
                    'and the pass planned, rather than a custom resource being looked for',
                );
                assert.equal(
                    answer.updated,
                    false,
                    'nothing was applied, because this process has no install tree to write',
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
                    'artifact-digest': 'a'.repeat(64),
                    'framework-version': '1.42.0',
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
                        artifactDigest: 'a'.repeat(64),
                        frameworkVersion: '1.42.0',
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
