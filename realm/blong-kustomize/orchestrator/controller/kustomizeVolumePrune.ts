import {handler, type IMeta} from '@feasibleone/blong';

type ClusterFind = (params: unknown, $meta: IMeta) => Promise<{items?: unknown[]}>;

interface IItem {
    metadata?: {name?: string; labels?: Record<string, string>};
}

/**
 * kustomize.volume.prune — which retained versions are past the retention.
 *
 * The decision is computed here and returned; the deletion is **not** performed.
 * Phase 6 promised retention as a *policy*, and the policy is this: versions are
 * ordered, the newest `retention` are kept, and the rest are candidates. Only
 * the operator may delete, because only it has cluster access — and a handler
 * that deleted on a read pass, in a namespace named after a suite, is the kind
 * of mistake worth not being able to make by accident.
 */
/**
 * Which retained versions are past the retention, oldest first.
 *
 * Exported because the decision is the whole of this handler's contract and no cluster is involved in
 * it: the versions come from labels, and the ordering, the minimum and the split are what a reader
 * has to get right. Written out so a test can hold it down, which is what the handler's first live
 * run showed was missing — its adapter lookup had been spelled wrongly since it was written and
 * nothing exercised it (T-245).
 *
 * The retention is clamped to at least one: a suite must keep something to roll back to, and a
 * `--retention=0` that deleted the running version would be a request nobody means.
 */
export const retentionDecision = (
    versions: string[],
    retention?: number,
): {prune: string[]; retain: string[]} => {
    const ordered = [...new Set(versions)].sort();
    const keep = Math.max(1, retention ?? 3);
    const split = Math.max(0, ordered.length - keep);
    return {prune: ordered.slice(0, split), retain: ordered.slice(split)};
};

export default handler(({handler}) => {
    const find = (name: string): ClusterFind | undefined => {
        const candidate = (handler as Record<string, unknown>)[name];
        return typeof candidate === 'function' ? (candidate as ClusterFind) : undefined;
    };
    return {
        async kustomizeVolumePrune(
            params: {retention?: number} = {},
            $meta?: IMeta,
        ): Promise<{prune: string[]; retain: string[]; deleted: boolean; reason?: string}> {
            // The kind's name carries its words apart, and that is not cosmetic: a method name has
            // exactly three parts, so the proxy splits the name it is handed on the capital letters.
            // `clusterPersistentVolumeClaimFind` became `cluster.persistent.volumeClaimFind`, whose
            // middle part is `persistent`, and the adapter answered `no verb matched` — the join is
            // what keeps the words one part, and the adapter joins them again for the client
            // (`[K8S_ADAPTER_VERBS]`; the wire names in `testClusterApply` spell every compound kind
            // the same way). Nothing caught this while the handler had no caller (T-245).
            const list = find('clusterPersistent_Volume_ClaimFind');
            if (!list) {
                return {
                    prune: [],
                    retain: [],
                    deleted: false,
                    reason: 'the cluster adapter is not loaded',
                };
            }
            // The *identity* rather than the version: two artifacts of one version are two claims, and a
            // retention that counted versions would call them one and retire the wrong number (D-469).
            // The version is read as well, so claims a revision before the identity carry a number the
            // step can still count.
            const identities = ((await list({}, $meta as IMeta))?.items ?? [])
                .map(
                    item =>
                        (item as IItem).metadata?.labels?.['blong.feasible.one/volume-identity'] ??
                        (item as IItem).metadata?.labels?.['blong.feasible.one/suite-version'],
                )
                .filter((identity): identity is string => typeof identity === 'string');
            return {
                ...retentionDecision(identities, params.retention),
                deleted: false,
                reason: 'deletion is the operator’s to perform, not a read pass’s',
            };
        },
    };
});
