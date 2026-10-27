import {type IAssert, handler} from '@feasibleone/blong';

import type {IClusterObject, IDesiredResource} from '../../../apply.ts';
import {
    availableReplicas,
    listingScopes,
    unreadableFailures,
} from '../../../orchestrator/controller/kustomizeReconcileRun.ts';

/**
 * server/test/test/testReconcileScope.ts — where a pass looks for what it wants; a scope that cannot
 * see an object makes the pass reapply it forever.
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

            async function theServicesNamespaceIsSweptForGeneratedCredentials(assert: IAssert) {
                // A switched-off service names nothing in the namespace it ran in, so no object scopes
                // it and the pass cannot see the Secret it generated there — which is how a generated
                // credential outlived the declaration it was derived from. The scope is added from the
                // declaration, and only for the credential kind: the label is what makes acting on what
                // the listing answers safe in a namespace that is not the tenant's (@@D-461 @@D-509).
                const scopes = listingScopes([], ['secret', 'job'], 'shop', 'shop-services');
                assert.deepEqual(
                    scopes.map(scope => `${scope.resourceType}@${scope.namespace}`).sort(),
                    ['job@shop', 'secret@shop', 'secret@shop-services'],
                    'the generated credentials are looked for in the services namespace as well',
                );
                assert.ok(
                    scopes.every(scope => scope.desired.length === 0),
                    'and a scope added for a sweep names no object of its own',
                );
                // The flag is what keeps a namespace nothing creates from failing every pass: the
                // scope is here to find a leftover, so a pass that cannot read it says so and applies
                // the rest (@@D-515) — while the scopes that hold this deployment's objects do not get
                // that allowance, because an object of it may be in one of them unseen.
                assert.deepEqual(
                    scopes
                        .filter(scope => scope.namespace === 'shop-services')
                        .map(scope => scope.cleanupOnly === true),
                    [true],
                    'and it is marked as the one scope that cannot fail the pass',
                );
                assert.ok(
                    scopes
                        .filter(scope => scope.namespace === 'shop')
                        .every(scope => scope.cleanupOnly === false),
                    'while the scopes that hold this deployment are not',
                );
                // A deployment whose services run beside it needs one listing, not two.
                const single = listingScopes([], ['secret'], 'shop', 'shop');
                assert.deepEqual(
                    single.map(scope => `${scope.resourceType}@${scope.namespace}`),
                    ['secret@shop'],
                    'and a services namespace that is the tenant one is listed once',
                );
            },

            async function aNamespaceTheDeploymentNeverUsedIsNotSwept(assert: IAssert) {
                // A suite that brings no backing service is granted nothing in the services namespace,
                // so a sweep there is a listing the API server refuses — with a stack, at error level,
                // on every reconcile — for a namespace that may not even exist for this deployment
                // (@@F-619). The declaration still decides the other way round: a service switched
                // off names nothing in the tree either, and the credentials it generated there are
                // what the sweep is for (@@D-509).
                const unused = listingScopes([], ['secret'], 'shop', 'shop-services', false);
                assert.deepEqual(
                    unused.map(scope => `${scope.resourceType}@${scope.namespace}`),
                    ['secret@shop'],
                    'a namespace no object of the tree names is not swept',
                );
                assert.ok(
                    unused.every(scope => scope.cleanupOnly !== true),
                    'and nothing is added that could only answer forbidden',
                );
                const declaredService = listingScopes([], ['secret'], 'shop', 'shop-services', true);
                assert.deepEqual(
                    declaredService.map(scope => `${scope.resourceType}@${scope.namespace}`).sort(),
                    ['secret@shop', 'secret@shop-services'],
                    'while a declaration that mentions a service still sweeps it',
                );
            },

            async function anUnreadableCleanupScopeDoesNotFailThePass(assert: IAssert) {
                const failures = unreadableFailures([
                    {key: 'shop/deployment', message: 'forbidden', cleanupOnly: false},
                    {key: 'shop-services/secret', message: 'forbidden', cleanupOnly: true},
                ]);
                assert.deepEqual(
                    failures,
                    [{key: 'shop/deployment', message: 'forbidden'}],
                    'a scope that exists to find leftovers cannot fail a pass that applied everything',
                );
                assert.deepEqual(
                    unreadableFailures([{key: 'shop/secret', message: 'forbidden', cleanupOnly: false}]),
                    [{key: 'shop/secret', message: 'forbidden'}],
                    'while a scope that holds this deployment does fail it',
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
