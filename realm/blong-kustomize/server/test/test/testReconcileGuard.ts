import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

import {crListingScope} from '../../../orchestrator/controller/kustomizeReconcileRun.ts';

/**
 * server/test/test/testReconcileGuard.ts — what a reconcile pass refuses; a registry pass with no
 * suite entry would deploy the realm's own bare ports (@@F-406).
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
            async function readsTheCrsItCanSeeWhenNobodyNamesOne(assert: IAssert) {
                // The page's Reconcile button is this caller: it sends `from: 'cr'` and no namespace,
                // because a deployment page lists a suite it did not have to name. An operator is
                // configured with one namespace and installed for suites in others, so the pass has
                // to read the CRs it can see rather than the namespace it happens to know .
                assert.deepEqual(
                    crListingScope({configured: 'blong-system', held: 0}),
                    {scope: 'any namespace', namespaced: false},
                    'a caller that named no namespace and found nothing reads the whole cluster',
                );
                assert.deepEqual(
                    crListingScope({named: 'blong-suite', configured: 'blong-system', held: 0}),
                    {scope: 'blong-suite', namespaced: true},
                    'a namespace that was named is answered about that namespace, never widened',
                );
                assert.deepEqual(
                    crListingScope({configured: 'blong-system', held: 1}),
                    {scope: 'blong-system', namespaced: true},
                    'and the CR the configured namespace holds is found without asking the cluster',
                );
            },
        ]),
}));
