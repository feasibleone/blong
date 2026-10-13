import {type IAssert, type IMeta, handler} from '@feasibleone/blong';
import {OPERATOR_GROUP, OPERATOR_PLURAL, OPERATOR_VERSION} from '../../../operator.ts';

/**
 * server/test/test/testClusterStatus.ts — the operator's status subresource, on a cluster: the patch
 * shape and the CRD fields it needs @@F-382. Gated by `BLONG_TEST_APPLY=1`.
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
