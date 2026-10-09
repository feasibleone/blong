import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/**
 * server/test/test/testClusterApply.ts — the apply path on the kinds that broke it.
 *
 * F-369 was that the adapter built client method names by capitalising only the first letter, so
 * every compound kind — `DaemonSet`, `PersistentVolumeClaim`, and the rest — was unreachable. Those
 * are exactly the kinds the volume backends need, which means the apply path could never have
 * worked against a cluster. This group proves it does now, and it is gated because it writes:
 *
 *     BLONG_TEST_APPLY=1 node --run test
 *
 * The wire names below spell those kinds with their words apart (`clusterPersistent_Volume_ClaimApply`):
 * a Blong method name has exactly three parts, so a two-word object would be read as two of them and
 * the request would land nowhere near the API it wanted. The separator is what keeps the words one
 * part, and the adapter joins them again into the client's own spelling. The realm's `apply.ts` maps
 * its kinds the same way, which is why the map exists.
 *
 * The DaemonSet selects a node that does not exist, so nothing is scheduled: what is being tested is
 * that the object can be created, read back and deleted, not that a pod runs.
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
