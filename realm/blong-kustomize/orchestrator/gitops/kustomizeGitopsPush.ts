import {handler} from '@feasibleone/blong';

/** What a push attempt reports, whether or not anything was pushed. */
export interface IGitopsResult {
    pushed: boolean;
    /** Why nothing was pushed, when `pushed` is false. */
    reason?: string;
    /** The configured destination, echoed back for the caller's log. */
    target?: string;
}

/**
 * kustomize.gitops.push — the seam, not the implementation: a no-op that says so without a target, and
 * a refusal with a target but no adapter.
 */
export default handler(() => ({
    kustomizeGitopsPush(params: {target?: string} = {}): IGitopsResult {
        const self = this as unknown as {config?: {gitops?: {target?: string}}};
        const target = params.target ?? self.config?.gitops?.target;
        if (!target) return {pushed: false, reason: 'no gitops target configured'};
        return {pushed: false, reason: `no gitops adapter for target ${target}`, target};
    },
}));
