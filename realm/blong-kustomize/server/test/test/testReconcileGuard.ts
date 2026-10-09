import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/**
 * server/test/test/testReconcileGuard.ts — what a reconcile pass refuses.
 *
 * A pass has two origins: the registry this process loaded, and a CR it was handed. The registry one
 * means "reconcile the suite this process is", so a process that is the *realm* rather than a suite
 * has no tree of its own to apply — running the realm's own CLI against a cluster planned the realm's
 * bare ports and deployed them into the namespace it was pointed at, which the cluster showed as
 * Deployments called `blong`, `codec` and `kustomize` beside the suite's own (F-406). Nothing
 * complained, because a pass reports what it created.
 *
 * The realm's own test process is exactly that shape, which is why this needs no cluster: it declares
 * no suite entry, so the pass refuses before it reaches an adapter.
 *
 * Registered as the `test.reconcile.guard` group (`integration.watch.test` in `index.ts`).
 */
export default handler(({lib: {group}, handler: {kustomizeReconcileRun}}) => ({
    testReconcileGuard: ({name = 'reconcile guard'}: {name?: string} = {}) =>
        group(name)([
            async function aRegistryPassNeedsASuiteEntry(assert: IAssert, {$meta}: {$meta: IMeta}) {
                const answer = (await kustomizeReconcileRun(
                    // Everything the run that deployed the realm's own ports gave the pass: a
                    // namespace to write into and permission to write. The refusal has to come from
                    // the missing suite rather than from a missing instruction.
                    {namespace: 'someone-else-suite', apply: true},
                    $meta,
                )) as {reconciled: number; applied: boolean; reason?: string};

                assert.equal(
                    answer.applied,
                    false,
                    'a process with no suite entry applies nothing',
                );
                assert.equal(answer.reconciled, 0, 'and reconciles no object');
                assert.match(
                    String(answer.reason),
                    /declares no suite entry/,
                    'while saying which declaration is missing, rather than deploying quietly (T-260)',
                );
            },
        ]),
}));
