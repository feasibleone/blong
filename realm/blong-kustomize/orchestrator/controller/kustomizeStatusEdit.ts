import {handler, type IMeta} from '@feasibleone/blong';
import {
    OPERATOR_GROUP,
    OPERATOR_PLURAL,
    OPERATOR_VERSION,
    type IStatusResult,
    type StatusPhase,
} from '../../operator.ts';

type ClusterCall = (params: unknown, $meta: IMeta) => Promise<unknown>;

export interface IStatusEdit {
    /** The CR to report on. */
    name: string;
    /** Its namespace, which is the tenant it deploys into. */
    namespace?: string;
    phase: StatusPhase;
    /** The suite version this operator has actually applied. */
    observedVersion?: string;
    /** One sentence for a human: what happened, or what is missing. */
    message?: string;
    /** Per Deployment, how many replicas are available — the evidence behind a phase. */
    deployments?: Array<{name: string; available: number}>;
    /** The last pass, counted. */
    lastResult?: IStatusResult;
}

/**
 * kustomize.status.edit — the operator writing back what it did.
 *
 * The status is a subresource, so this goes through `patch` with `subresource: 'status'` and a
 * merge patch of the `status` object alone: a patch to the object's own path cannot change a
 * status field at all, and a patch that also carried a spec would be a way to edit a tenant's
 * declaration by accident.
 *
 * A status write is a report, not a step: it never changes what a pass applied, so a failed write
 * is answered rather than thrown. The caller has already done the work the status describes, and a
 * reconcile that failed because it could not describe itself would be the worse failure.
 */
export default handler(({handler}) => {
    const call = (name: string): ClusterCall | undefined => {
        const candidate = (handler as Record<string, unknown>)[name];
        return typeof candidate === 'function' ? (candidate as ClusterCall) : undefined;
    };

    return {
        async kustomizeStatusEdit(
            params: IStatusEdit,
            $meta?: IMeta,
        ): Promise<{updated: boolean; reason?: string}> {
            const patch = call('clusterCustomPatch');
            if (!patch) return {updated: false, reason: 'the cluster adapter is not loaded'};
            if (!params?.name) return {updated: false, reason: 'no BlongDeployment named'};
            const namespace =
                params.namespace ??
                (this as unknown as {config?: {namespace?: string}}).config?.namespace;
            if (!namespace) return {updated: false, reason: 'no namespace to report into'};
            const status: Record<string, unknown> = {phase: params.phase};
            // Absent fields are left out rather than written as undefined: a merge patch replaces
            // what it names, so an explicit undefined would erase a value the pass did not touch.
            if (params.observedVersion !== undefined)
                status.observedVersion = params.observedVersion;
            if (params.message !== undefined) status.message = params.message;
            if (params.deployments !== undefined) status.deployments = params.deployments;
            if (params.lastResult !== undefined) status.lastResult = params.lastResult;
            try {
                await patch(
                    {
                        group: OPERATOR_GROUP,
                        version: OPERATOR_VERSION,
                        plural: OPERATOR_PLURAL,
                        namespace,
                        name: params.name,
                        // The subresource the API writes a status through, and the reason the
                        // adapter was taught to name one (`k8s.noMethod` otherwise).
                        subresource: 'status',
                        // A list of operations, not an object: the client sends
                        // `application/json-patch+json` for a custom resource whatever it is handed,
                        // so an object body comes back as "cannot unmarshal object into
                        // []jsonPatchOp" (RFC 6902). `add` on a member that exists replaces it, so
                        // one operation covers the first write and every one after it — at the price
                        // of naming every field the status holds, which the CRD declares in full.
                        body: [{op: 'add', path: '/status', value: status}],
                    },
                    $meta as IMeta,
                );
                return {updated: true};
            } catch (error) {
                return {
                    updated: false,
                    reason: error instanceof Error ? error.message : String(error),
                };
            }
        },
    };
});
