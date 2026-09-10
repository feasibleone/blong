import {handler, type IMeta} from '@feasibleone/blong';
import type Assert from 'node:assert';

/**
 * testK8sPodLog — integration test for the commander explore vocabulary of
 * `adapter.k8s`:
 *   `cluster.pod.find` → list pods in the namespace
 *   `cluster.pod.log`  → read pod container logs
 */
export default handler(({lib: {group}, handler: {clusterPodFind, clusterPodLog}}) => ({
    testK8sPodLog: ({name = 'k8s pod log explore'}: {name?: string}) =>
        group(name)([
            async function findPods(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                const result = await clusterPodFind({}, $meta);
                assert.ok(result !== undefined, 'pod.find should return a result');
                return result;
            },
            async function readPodLog(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                // Tolerant: only read logs when a pod actually exists.
                const pods = (await clusterPodFind({}, $meta)) as {
                    items?: Array<{metadata?: {name?: string; namespace?: string}}>;
                };
                const pod = (pods.items ?? []).find(item => item.metadata?.name);
                if (!pod?.metadata?.name) {
                    assert.ok(true, 'no pod available; skipping log read');
                    return {};
                }
                const result = await clusterPodLog(
                    {
                        name: pod.metadata.name,
                        namespace: pod.metadata.namespace,
                        tailLines: 10,
                    },
                    $meta,
                );
                assert.ok(result !== undefined, 'pod.log should return a result');
                assert.ok(
                    typeof (result as {logs?: string}).logs === 'string',
                    'logs should be a string',
                );
                return result;
            },
        ]),
}));
