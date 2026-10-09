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
 * kustomize.gitops.push — the seam, not the implementation.
 *
 * The PRD keeps the GitOps operator out of scope while asking the module to be
 * *able* to hand the generated tree to one. This handler is that seam: a suite
 * names `gitops.target` in the realm config, and a future adapter — a git
 * adapter, or a call to a CI job — performs the push into a branch/PR or a
 * commit.
 *
 * Until then it is deliberately honest: with no target it is a no-op that says
 * so, and with a target but no adapter it refuses and says so. A seam that
 * claimed success without pushing would be worse than one that reports it did
 * nothing, because the caller cannot tell the difference from the outside.
 */
export default handler(() => ({
    kustomizeGitopsPush(params: {target?: string} = {}): IGitopsResult {
        const self = this as unknown as {config?: {gitops?: {target?: string}}};
        const target = params.target ?? self.config?.gitops?.target;
        if (!target) return {pushed: false, reason: 'no gitops target configured'};
        return {pushed: false, reason: `no gitops adapter for target ${target}`, target};
    },
}));
