import {type IAssert, handler} from '@feasibleone/blong';

import type {IClusterObject, IDesiredResource} from '../../../apply.ts';
import {
    availableReplicas,
    listingScopes,
} from '../../../orchestrator/controller/kustomizeReconcileRun.ts';

/**
 * server/test/test/testReconcileScope.ts — where a pass looks for what it wants.
 *
 * The scope is what decides what a pass can ever see, and getting it wrong is invisible in the pass's
 * own report: an object the listing cannot reach is an object the pass believes is missing, so it
 * applies it again on every pass. That is how a suite's backing service — provisioned in the services
 * namespace beside its neighbours rather than in the tenant's — was applied on every pass: the claim
 * among its objects is applied with a PUT, a *bound* claim refuses one (`spec is immutable`), and the
 * CR could never leave `Failed` while the suite's own workloads sat `Available` beside it (the
 * kustomize e2e run that found it).
 *
 * Cluster-free on purpose: the handler around it needs a cluster, and this is the half worth pinning
 * without one, the way the retention decision is.
 *
 * Registered as the `test.reconcile.scope` group (`integration.watch.test` in `index.ts`).
 */
export default handler(({lib: {group}}) => ({
    testReconcileScope: ({name = 'reconcile scope'}: {name?: string} = {}) =>
        group(name)([
            async function aScopeIsWhereItsObjectsNameIt(assert: IAssert) {
                const scopes = listingScopes(
                    [
                        desired('deployment', 'Deployment', 'access', 'shop'),
                        desired(
                            'persistent_volume_claim',
                            'PersistentVolumeClaim',
                            'mysql-data',
                            'shop-services',
                        ),
                    ],
                    [],
                    'shop',
                );

                assert.deepEqual(
                    scopes.map(scope => `${scope.resourceType}@${scope.namespace}`).sort(),
                    ['deployment@shop', 'persistent_volume_claim@shop-services'],
                    "a service's claim is looked for where it says it lives, not in the tenant's own",
                );
                assert.deepEqual(
                    scopes.map(scope => scope.desired.length).sort(),
                    [1, 1],
                    'and the objects that named a scope travel with it',
                );
            },

            async function oneKindInTwoNamespacesIsTwoListings(assert: IAssert) {
                const scopes = listingScopes(
                    [
                        desired('configmap', 'ConfigMap', 'suite-keys', 'shop'),
                        desired('configmap', 'ConfigMap', 'mysql-init', 'shop-services'),
                    ],
                    [],
                    'shop',
                );

                assert.deepEqual(
                    scopes.map(scope => `${scope.resourceType}@${scope.namespace}`).sort(),
                    ['configmap@shop', 'configmap@shop-services'],
                    'one kind beside two namespaces is two listings rather than one',
                );
            },

            async function aKindTheTreeDroppedIsSweptInTheTenantNamespace(assert: IAssert) {
                const scopes = listingScopes(
                    [desired('deployment', 'Deployment', 'access', 'shop')],
                    ['job', 'secret'],
                    'shop',
                );

                assert.deepEqual(
                    scopes.map(scope => `${scope.resourceType}@${scope.namespace}`).sort(),
                    ['deployment@shop', 'job@shop', 'secret@shop'],
                    'a kind nothing desires is looked for where a suite’s own objects are',
                );
                assert.equal(
                    scopes.find(scope => scope.resourceType === 'job')?.desired.length,
                    0,
                    'with nothing desired: a sweep is looking for what is no longer wanted',
                );
                assert.equal(
                    scopes.filter(scope => scope.resourceType === 'deployment').length,
                    1,
                    'and a kind the tree names is not listed twice for the sweep',
                );
            },

            async function thePhaseCountsDeploymentsWhereTheyLive(assert: IAssert) {
                // The other half of the same fault: the phase is `Ready` only when every Deployment
                // the tree names is available, and a backing service's Deployment is not in the
                // tenant's namespace — so a pass that counted it there waited for a replica that
                // would never appear, and the CR sat in `Progressing` beside a healthy suite.
                assert.deepEqual(
                    availableReplicas(
                        [
                            {name: 'access', namespace: 'shop'},
                            {name: 'mysql', namespace: 'shop-services'},
                        ],
                        [
                            {namespace: 'shop', items: [available('access', 1)]},
                            {namespace: 'shop-services', items: [available('mysql', 1)]},
                        ],
                    ),
                    [
                        {name: 'access', available: 1},
                        {name: 'mysql', available: 1},
                    ],
                    'each Deployment is counted in the namespace its object names',
                );
                assert.deepEqual(
                    availableReplicas(
                        [{name: 'access', namespace: 'shop'}],
                        [{namespace: 'shop', items: [available('access', 0)]}],
                    ),
                    [{name: 'access', available: 0}],
                    'and one that has not rolled out yet reads as no available replicas',
                );
                assert.deepEqual(
                    availableReplicas(
                        [{name: 'mysql', namespace: 'shop-services'}],
                        [{namespace: 'shop', items: [available('mysql', 1)]}],
                    ),
                    [{name: 'mysql', available: 0}],
                    'while the same name in another namespace is a different object',
                );
                assert.deepEqual(
                    availableReplicas([], []),
                    [],
                    'and a tree that names no Deployment asks for nothing',
                );
            },
        ]),
}));

/** A live Deployment, as much of it as the phase reads. */
function available(name: string, availableReplicas: number): IClusterObject {
    return {kind: 'Deployment', metadata: {name}, status: {availableReplicas}};
}

/** A manifest the plan wants, carrying what a scope reads and nothing else. */
function desired(
    resourceType: string,
    kind: string,
    name: string,
    namespace: string,
): IDesiredResource {
    return {
        path: `${resourceType}/${name}.yaml`,
        kind,
        resourceType,
        object: {kind, metadata: {name, namespace}},
    };
}
