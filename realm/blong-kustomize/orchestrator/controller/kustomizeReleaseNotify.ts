import {handler, type IMeta} from '@feasibleone/blong';
import {OPERATOR_GROUP, OPERATOR_PLURAL, OPERATOR_VERSION} from '../../operator.ts';

type ClusterCall = (params: unknown, $meta: IMeta) => Promise<unknown>;
type GitopsCall = (params: {target?: string}, $meta?: IMeta) => {pushed: boolean; reason?: string};

export interface IReleaseNotify {
    /** The suite, which is the CR's own name — the operator reads it off the object (Q4). */
    suite: string;
    /** The version the release published. */
    version: string;
    /** Where the artifact came from, when the release published a new one. */
    artifactUrl?: string;
    /** The framework image tag, when the release moved it. */
    frameworkImage?: string;
    /** The tenant namespace; the realm's own config answers when it is omitted. */
    namespace?: string;
}

/**
 * kustomize.release.notify — a release telling a cluster what to run.
 *
 * A release publishes two things, the framework image and the suite artifact, and what a cluster
 * needs from it is one write to the declaration the cluster already holds: the CR is the single
 * input the operator converges from (D-379), so announcing a release is a patch to `spec.version`
 * and to the artifact URL rather than a second mechanism for putting objects on a cluster.
 *
 * **Two seams, one of them chosen (Q9).** A cluster whose operator watches a CR wants the patch; a
 * cluster whose operator watches a repository wants the release to push the regenerated tree
 * instead. Doing both would mean two operators converging on one suite, so the GitOps seam wins when
 * a target is configured and the patch is what happens otherwise — and the answer says which seam
 * ran, because "the release succeeded" is not the interesting part of this call.
 *
 * The patch touches the version and the artifact and nothing else. The entry, the intents and the
 * volume are the release's and the tenant's business, and a release that rewrote them would be
 * editing a deployment it was not asked to edit; the operator regenerates the tree from the
 * declaration, so a field the release does not name keeps the value it had.
 */
export const releasePatch = (
    params: Pick<IReleaseNotify, 'version' | 'frameworkImage' | 'artifactUrl'>,
): Array<{op: string; path: string; value: unknown}> => {
    // A list of operations rather than an object, for the reason `kustomize.status.edit` documents at
    // length: the client sends `application/json-patch+json` for a custom resource, and `add` replaces
    // a member that is already there, so one operation covers the first release and every one after it.
    //
    // Every path is a *member*, and the artifact's is the one that matters: `add` on
    // `/spec/suiteVolume` replaces the whole volume, so a release that meant to move the artifact also
    // reset `backend` and `retention` to whatever the CRD declares as a default — a node-local suite
    // became `auto` because a release happened, with nothing in the answer saying so. Written out and
    // exported because that is the kind of mistake a test can hold down and a reading cannot.
    const body: Array<{op: string; path: string; value: unknown}> = [
        {op: 'add', path: '/spec/version', value: params.version},
    ];
    if (params.frameworkImage !== undefined) {
        body.push({op: 'add', path: '/spec/frameworkImage', value: params.frameworkImage});
    }
    if (params.artifactUrl !== undefined) {
        body.push({
            op: 'add',
            path: '/spec/suiteVolume/artifact',
            value: {source: 'url', url: params.artifactUrl},
        });
    }
    return body;
};

export default handler(({handler}) => {
    const call = <T>(name: string): T | undefined => {
        const candidate = (handler as Record<string, unknown>)[name];
        return typeof candidate === 'function' ? (candidate as T) : undefined;
    };

    return {
        async kustomizeReleaseNotify(
            params: IReleaseNotify,
            $meta?: IMeta,
        ): Promise<{
            updated: boolean;
            gitops: {pushed: boolean; reason?: string};
            reason?: string;
        }> {
            const gitops = call<GitopsCall>('kustomizeGitopsPush');
            // Consulted first, because it decides whether the CR is the right place to write at all:
            // with a gitops target there is an operator converging from the repository, and a patch
            // here would be a second one converging from the cluster.
            const pushed = gitops?.({}, $meta) ?? {
                pushed: false,
                reason: 'the gitops seam is not loaded',
            };
            if (pushed.pushed) return {updated: false, gitops: pushed};

            const patch = call<ClusterCall>('clusterCustomPatch');
            if (!patch)
                return {
                    updated: false,
                    gitops: pushed,
                    reason: 'the cluster adapter is not loaded',
                };
            if (!params?.suite) return {updated: false, gitops: pushed, reason: 'no suite named'};
            if (!params.version)
                return {updated: false, gitops: pushed, reason: 'no version to announce'};
            const namespace =
                params.namespace ??
                (this as unknown as {config?: {namespace?: string}}).config?.namespace;
            if (!namespace)
                return {updated: false, gitops: pushed, reason: 'no namespace to write into'};

            const body = releasePatch(params);
            try {
                await patch(
                    {
                        group: OPERATOR_GROUP,
                        version: OPERATOR_VERSION,
                        plural: OPERATOR_PLURAL,
                        namespace,
                        name: params.suite,
                        body,
                    },
                    $meta as IMeta,
                );
                return {updated: true, gitops: pushed};
            } catch (error) {
                return {
                    updated: false,
                    gitops: pushed,
                    reason: error instanceof Error ? error.message : String(error),
                };
            }
        },
    };
});
