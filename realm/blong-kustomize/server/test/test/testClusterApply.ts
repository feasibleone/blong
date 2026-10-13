import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/**
 * server/test/test/testClusterApply.ts — the apply path on the compound kinds it broke on; gated by
 * `BLONG_TEST_APPLY=1` @@F-369.
 */
export default handler(
    ({
        lib: {group},
        handler: {
            clusterNamespaceApply,
            clusterNamespaceRemove,
            clusterPersistent_Volume_ClaimApply,
            clusterPersistent_Volume_ClaimFind,
            clusterPersistent_Volume_ClaimRemove,
            clusterDaemon_SetApply,
            clusterDaemon_SetFind,
            clusterDaemon_SetRemove,
        },
    }) => ({
        testClusterApply: ({name = 'cluster apply'}: {name?: string} = {}) =>
            group(name)([
                async function createsTheKindsThatUsedToBeUnreachable(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    if (process.env.BLONG_TEST_APPLY !== '1') {
                        return {skipped: 'set BLONG_TEST_APPLY=1 to write to a cluster'};
                    }
                    const namespace = 'blong-kustomize-apply-test';
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
                    await clusterPersistent_Volume_ClaimApply(
                        {
                            // The namespace is a *parameter*: the adapter builds the URL from it and
                            // a body that disagrees with the URL is a 400, not a helpful error.
                            namespace,
                            body: {
                                apiVersion: 'v1',
                                kind: 'PersistentVolumeClaim',
                                metadata: {name: 'apply-test', namespace},
                                spec: {
                                    accessModes: ['ReadWriteOnce'],
                                    resources: {requests: {storage: '1Mi'}},
                                },
                            },
                        },
                        $meta,
                    );
                    await clusterDaemon_SetApply(
                        {
                            namespace,
                            body: {
                                apiVersion: 'apps/v1',
                                kind: 'DaemonSet',
                                metadata: {name: 'apply-test', namespace},
                                spec: {
                                    selector: {matchLabels: {app: 'apply-test'}},
                                    template: {
                                        metadata: {labels: {app: 'apply-test'}},
                                        spec: {
                                            nodeSelector: {
                                                'blong.feasible.one/no-such-label': 'true',
                                            },
                                            containers: [
                                                {
                                                    name: 'pause',
                                                    image: 'registry.k8s.io/pause:3.9',
                                                },
                                            ],
                                        },
                                    },
                                },
                            },
                        },
                        $meta,
                    );
                    return {namespace};
                },

                async function readsTheCompoundKindsBack(
                    assert: IAssert,
                    {
                        $meta,
                        createsTheKindsThatUsedToBeUnreachable: created,
                    }: {
                        $meta: IMeta;
                        createsTheKindsThatUsedToBeUnreachable: Promise<{
                            namespace?: string;
                            skipped?: string;
                        }>;
                    },
                ) {
                    const {namespace, skipped} = await created;
                    if (skipped || !namespace) return {skipped};

                    const claims = (await clusterPersistent_Volume_ClaimFind(
                        {namespace},
                        $meta,
                    )) as {
                        items?: Array<{metadata?: {name?: string}}>;
                    };
                    assert.ok(
                        (claims?.items ?? []).some(item => item.metadata?.name === 'apply-test'),
                        'a PersistentVolumeClaim can be created and listed',
                    );

                    const daemonSets = (await clusterDaemon_SetFind({namespace}, $meta)) as {
                        items?: Array<{metadata?: {name?: string}}>;
                    };
                    assert.ok(
                        (daemonSets?.items ?? []).some(
                            item => item.metadata?.name === 'apply-test',
                        ),
                        'and so can a DaemonSet',
                    );
                    return {namespace};
                },

                async function cleansUpAfterItself(
                    assert: IAssert,
                    {
                        $meta,
                        readsTheCompoundKindsBack: reviewed,
                    }: {
                        $meta: IMeta;
                        readsTheCompoundKindsBack: Promise<{namespace?: string; skipped?: string}>;
                    },
                ) {
                    const {namespace, skipped} = await reviewed;
                    if (skipped || !namespace) return {skipped};
                    // The namespace goes last and takes its contents with it: a test that writes to a
                    // cluster leaves nothing behind, whatever else it proves.
                    await clusterDaemon_SetRemove({name: 'apply-test', namespace}, $meta);
                    await clusterPersistent_Volume_ClaimRemove(
                        {name: 'apply-test', namespace},
                        $meta,
                    );
                    const gone = (await clusterDaemon_SetFind({namespace}, $meta)) as {
                        items?: unknown[];
                    };
                    assert.equal(
                        (gone?.items ?? []).length,
                        0,
                        'and the objects it created are gone',
                    );
                    await clusterNamespaceRemove({name: namespace}, $meta);
                },
            ]),
    }),
);
