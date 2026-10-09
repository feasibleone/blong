import {handler, type IMeta} from '@feasibleone/blong';

interface IClusterDeployment {
    metadata?: {name?: string; namespace?: string; uid?: string; creationTimestamp?: string};
    status?: {availableReplicas?: number; replicas?: number};
}

/**
 * One row of the Deployment list.
 *
 * Named rather than left as `unknown`, because this is the type the framework turns into the
 * method's schema: the page's column titles, the OpenAPI document and the handler all read from it,
 * and an unnamed row makes all three describe nothing. The status is the two values the mapping
 * below can produce, so a client that renders it can be exhaustive.
 */
interface IKustomizeDeploymentRow {
    /** The object's UID, falling back to its name when the cluster gives no UID. */
    deploymentId?: string;
    deploymentName?: string;
    deploymentStatus: 'ready' | 'pending';
    createdAt?: string;
}

/**
 * kustomize.deployment.find — the suite's deployments, in the shape the model
 * expects.
 *
 * It reads through the `cluster` adapter rather than talking to the API server
 * itself: `clusterDeploymentFind` is the framework's handler for
 * `cluster.deployment.find`, and resolving it through the handler proxy keeps
 * the IoC rule (no direct handler imports) and lets a test mock the cluster.
 *
 * The cluster's own fields are mapped onto the realm's model — `deploymentId`
 * from the object UID, `deploymentStatus` from whether pods are available — so
 * the Browse page shows something meaningful instead of the raw manifest.
 */
export default handler(({handler: {clusterDeploymentFind}}) => ({
    async kustomizeDeploymentFind(
        params: {namespace?: string},
        $meta: IMeta,
    ): Promise<{items: IKustomizeDeploymentRow[]; total: number}> {
        const result = (await clusterDeploymentFind({namespace: params.namespace}, $meta)) as {
            items?: IClusterDeployment[];
        };
        const items = (result?.items ?? []).map(
            (deployment): IKustomizeDeploymentRow => ({
                deploymentId: deployment.metadata?.uid ?? deployment.metadata?.name,
                deploymentName: deployment.metadata?.name,
                deploymentStatus: deployment.status?.availableReplicas ? 'ready' : 'pending',
                createdAt: deployment.metadata?.creationTimestamp,
            }),
        );
        return {items, total: items.length};
    },
}));
