import {type IAssert, type IMeta, handler} from '@feasibleone/blong';
import {OPERATOR_GROUP, OPERATOR_PLURAL, OPERATOR_VERSION} from '../../../operator.ts';

/**
 * server/test/test/testClusterStatus.ts — the operator's report, on a cluster.
 *
 * The status is a subresource, and the write is the shape a wrong guess at it breaks on: the
 * generated client sends a JSON patch for a custom resource whatever it is handed, so an object body
 * comes back as "cannot unmarshal object into []jsonPatchOp" (F-382), and a patch to the object's
 * own path cannot change a status field at all. Three things therefore need a live cluster to be
 * true, and this group is where they are checked together:
 *
 * 1. the adapter addresses the subresource (`subresource: 'status'` becomes
 *    `patchNamespacedCustomObjectStatus`),
 * 2. the API server accepts the operation, and
 * 3. the CRD declares every field that was written — an unknown status field is *pruned*, so
 *    `phase` disappearing here is the same failure that took a regenerated CRD to fix in a
 *    namespace (T-229).
 *
 * Gated because it writes:
 *
 *     BLONG_TEST_APPLY=1 node --run test
 *
 * It writes its own `BlongDeployment` rather than any real one: a test that reported a phase onto a
 * live suite would be a test that broke the suite it was checking.
 */
export default handler(
    ({
        lib: {group},
        handler: {
            clusterNamespaceApply,
            clusterCustomApply,
            clusterCustomFind,
            clusterCustomRemove,
            kustomizeStatusEdit,
        },
    }) => ({
        testClusterStatus: ({name = 'cluster status'}: {name?: string} = {}) =>
            group(name)([
                async function writesAndReadsBackTheStatus(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    if (process.env.BLONG_TEST_APPLY !== '1') {
                        return {skipped: 'set BLONG_TEST_APPLY=1 to write to a cluster'};
                    }
                    const namespace = 'blong-kustomize-status-test';
                    const coordinates = {
                        group: OPERATOR_GROUP,
                        version: OPERATOR_VERSION,
                        plural: OPERATOR_PLURAL,
                        namespace,
                    };
                    await clusterNamespaceApply(
                        {
                            body: {
                                apiVersion: 'v1',
                                kind: 'Namespace',
                                metadata: {name: namespace},
                            },
                        },
                        $meta,
                    );
                    // A minimal but valid CR: `spec.suite` is the one required field the CRD names,
                    // and the operator is not asked to reconcile it — only to report on it.
                    await clusterCustomApply(
                        {
                            ...coordinates,
                            body: {
                                apiVersion: `${OPERATOR_GROUP}/${OPERATOR_VERSION}`,
                                kind: 'BlongDeployment',
                                metadata: {name: 'status-test', namespace},
                                spec: {suite: 'status-test'},
                            },
                        },
                        $meta,
                    );

                    const written = (await kustomizeStatusEdit(
                        {
                            name: 'status-test',
                            namespace,
                            phase: 'Progressing',
                            observedVersion: '9.9.9',
                            message: 'a test wrote this',
                            deployments: [{name: 'status-test', available: 0}],
                            lastResult: {
                                at: new Date().toISOString(),
                                created: 1,
                                updated: 2,
                                unchanged: 3,
                                obsolete: 4,
                                failures: 0,
                            },
                        },
                        $meta,
                    )) as {updated?: boolean};
                    assert.equal(written.updated, true, 'the status is written');

                    const found = (await clusterCustomFind(coordinates, $meta)) as {
                        items?: Array<{
                            metadata?: {name?: string};
                            status?: {
                                phase?: string;
                                observedVersion?: string;
                                message?: string;
                                deployments?: Array<{name?: string; available?: number}>;
                                lastResult?: {unchanged?: number};
                            };
                        }>;
                    };
                    const item = found?.items?.find(
                        entry => entry.metadata?.name === 'status-test',
                    );
                    assert.equal(
                        item?.status?.phase,
                        'Progressing',
                        'the phase survives the API server (the CRD has to declare it)',
                    );
                    assert.equal(item?.status?.observedVersion, '9.9.9', 'and the version');
                    assert.equal(item?.status?.message, 'a test wrote this', 'and the sentence');
                    assert.equal(
                        item?.status?.lastResult?.unchanged,
                        3,
                        'and the counts of the pass',
                    );
                    assert.equal(
                        item?.status?.deployments?.[0]?.available,
                        0,
                        'and the availability behind the phase',
                    );

                    await clusterCustomRemove({...coordinates, name: 'status-test'}, $meta);
                },
            ]),
    }),
);
