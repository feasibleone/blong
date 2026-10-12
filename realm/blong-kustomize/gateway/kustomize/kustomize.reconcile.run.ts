import {validation} from '@feasibleone/blong';

/**
 * gateway/kustomize.reconcile.run.ts — the action the deployment page's toolbar triggers.
 *
 * The method is the one the model's `browser.toolbar` entry names, so this file is the difference
 * between a Reconcile button that posts a 200 and one that posts nothing at all: a method the
 * gateway does not name has no route, and the page's call is answered `Not Found` (F-497). Nothing
 * else about the action is declared here — which it is, what it applies and what it prunes are the
 * handler's business, and the model says when to confirm.
 *
 * Authenticated by default: a pass writes to the cluster, so a caller has to be the holder of a
 * cluster token the operator accepts.
 */
export default validation(
    async ({lib: {type}}) =>
        function kustomizeReconcileRun() {
            return {
                params: type.Object({
                    /** Apply what the pass decided, rather than reporting it. */
                    apply: type.Optional(type.Boolean()),
                    /** Remove what the suite's tree no longer names. */
                    prune: type.Optional(type.Boolean()),
                    /** Where the pass reads its plan from. */
                    from: type.Optional(type.Union([type.Literal('registry'), type.Literal('cr')])),
                    /** Which CR the pass was triggered by, when the caller knows. */
                    name: type.Optional(type.String()),
                    /**
                     * The CR's namespace — the tenant. Declared because the handler reads it and
                     * validation *removes* what is not declared, so a caller that named a tenant was
                     * silently answered about the operator's own install instead: the pass looked in
                     * `blong-system`, found no `BlongDeployment` there, and reported that rather than
                     * the suite it was asked about (T-327).
                     */
                    namespace: type.Optional(type.String()),
                }),
                // Left open: the counts a pass reports are the handler's own shape, and the page
                // reads them from the answer rather than from a contract declared here.
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
