import {type IMeta, handler} from '@feasibleone/blong';

import {splitNames, uuidBuf} from './gatewayUuid.ts';

type KnexQb = any;

/**
 * Create/merge API bundles plus plain capabilities/roles.
 *
 * Wire: `gateway.bundle.merge` — a bundle wraps an `access.role` whose
 * capabilities/actions are the bundle's authorized scopes.  Also accepts
 * generic `capability` (name → action list) and `role` (name → capability
 * list) maps so seeds can wire management capabilities onto roles (e.g. a
 * Developer role), keeping authorization uniform in the jwt plugin.
 *
 * Resource creation goes through the shared `core.resource.ensure` helper and
 * graph edges through the shared `core.triple.merge` helper (P3), so the seed
 * no longer hand-rolls `core_triple` inserts or `access_pathRefresh()`.
 */
export default handler(
    ({
        handler: {
            'db/accessRoleEnsure': accessRoleEnsure,
            'db/coreResourceEnsure': coreResourceEnsure,
            'db/coreTripleMerge': coreTripleMerge,
        },
    }) =>
        async function gatewayBundleMerge(
            params: {
                /** capabilityName → comma-separated action names. */
                capability?: Record<string, string>;
                /** roleName → comma-separated capability names. */
                role?: Record<string, string>;
                bundle?: Record<
                    string,
                    {
                        roleBit?: number;
                        /** Capability name to wrap. */
                        capability?: string;
                        /** Comma-separated action names granted by the capability. */
                        actions?: string;
                        baseMonthlyCredits?: number;
                        rateLimit?: number;
                        rateWindowSec?: number;
                        isActive?: boolean;
                        description?: string;
                    }
                >;
            },
            $meta: IMeta,
        ): Promise<{success: boolean}> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');

            const triples: Array<{
                subjectId: string;
                predicateName: string;
                objectId: string;
            }> = [];

            // A merge is long enough that a reader of the diagram cannot tell where it got to, so
            // the phases announce themselves (PRD R26). A point is *announced*, not logged: it rides
            // the next record this scope emits, which is what lets a handler with no logger of its own
            // report its progress. In production `$meta.checkpoint` is not attached at all, so this
            // call costs nothing there.
            $meta.checkpoint?.('merge-started', {
                capabilities: Object.keys(params.capability ?? {}).length,
                roles: Object.keys(params.role ?? {}).length,
                bundles: Object.keys(params.bundle ?? {}).length,
            });

            // 1. Capabilities + their actions
            let actionsMerged = 0;
            if (params.capability) {
                for (const [capabilityName, actionList] of Object.entries(params.capability)) {
                    const {resourceId: capabilityId} = await coreResourceEnsure<{
                        resourceId: string;
                    }>(
                        {
                            name: capabilityName,
                            typeAlias: 'access.capability',
                            table: 'access_capability',
                            extraColumns: {description: `${capabilityName} capability`},
                            keyName: 'capabilityId',
                        },
                        $meta,
                    );
                    for (const actionName of splitNames(actionList)) {
                        const {resourceId: actionId} = await coreResourceEnsure<{
                            resourceId: string;
                        }>(
                            {
                                name: actionName,
                                typeAlias: 'access.action',
                                table: 'access_action',
                                extraColumns: {description: `${actionName} action`},
                                keyName: 'actionId',
                            },
                            $meta,
                        );
                        triples.push({
                            subjectId: capabilityId,
                            predicateName: 'hasAction',
                            objectId: actionId,
                        });
                        actionsMerged += 1;
                    }
                }
                $meta.checkpoint?.('capabilities-merged', {
                    capabilities: Object.keys(params.capability).length,
                    actions: actionsMerged,
                });
            }

            // 2. Roles + their capabilities
            if (params.role) {
                for (const [roleName, capabilityList] of Object.entries(params.role)) {
                    const {role: ensuredRole} = await accessRoleEnsure<{role: {roleId: string}}>(
                        {role: {roleName}},
                        $meta,
                    );
                    for (const capabilityName of splitNames(capabilityList)) {
                        const {resourceId: capabilityId} = await coreResourceEnsure<{
                            resourceId: string;
                        }>(
                            {
                                name: capabilityName,
                                typeAlias: 'access.capability',
                                table: 'access_capability',
                                extraColumns: {description: `${capabilityName} capability`},
                                keyName: 'capabilityId',
                            },
                            $meta,
                        );
                        triples.push({
                            subjectId: ensuredRole.roleId,
                            predicateName: 'hasCapability',
                            objectId: capabilityId,
                        });
                    }
                }
                $meta.checkpoint?.('roles-merged', {
                    roles: Object.keys(params.role).length,
                });
            }

            // 3. Bundles (role-wrapped capabilities with rate/credit metadata)
            if (params.bundle) {
                for (const [bundleName, bundleDef] of Object.entries(params.bundle)) {
                    // 1. Capability + actions
                    const capabilityName = bundleDef.capability ?? bundleName;
                    const actionNames = splitNames(bundleDef.actions ?? '');
                    for (const actionName of actionNames) {
                        const {resourceId: actionId} = await coreResourceEnsure<{
                            resourceId: string;
                        }>(
                            {
                                name: actionName,
                                typeAlias: 'access.action',
                                table: 'access_action',
                                extraColumns: {description: `${actionName} action`},
                                keyName: 'actionId',
                            },
                            $meta,
                        );
                        const {resourceId: capabilityId} = await coreResourceEnsure<{
                            resourceId: string;
                        }>(
                            {
                                name: capabilityName,
                                typeAlias: 'access.capability',
                                table: 'access_capability',
                                extraColumns: {description: `${capabilityName} capability`},
                                keyName: 'capabilityId',
                            },
                            $meta,
                        );
                        triples.push({
                            subjectId: capabilityId,
                            predicateName: 'hasAction',
                            objectId: actionId,
                        });
                    }

                    // 2. Role (the bundle) + hasCapability edges.  A declared bit is honoured;
                    // otherwise the framework allocates one.  That choice is a branch rather than an
                    // `if` (PRD R11/R26): which layout a merge chose is exactly what a diagram of it
                    // should show, and each branch announces the layout it took, so the alternative
                    // that was not taken stays visible beside the call that was made.
                    const ensureBundleRole = (roleBit?: number) =>
                        accessRoleEnsure<{role: {roleId: string}}>(
                            {
                                role: {
                                    roleName: bundleName,
                                    description: `${bundleName} bundle role`,
                                    ...(roleBit === undefined ? {} : {roleBit}),
                                },
                            },
                            $meta,
                        );
                    const decidedRole = await $meta.decide?.(
                        'role-bit',
                        {
                            bundleName,
                            declared: bundleDef.roleBit ?? null,
                        },
                        [
                            {
                                name: 'declared',
                                when: values => values.declared !== null,
                                run: () => {
                                    $meta.checkpoint?.('role-bit-declared', {
                                        roleBit: bundleDef.roleBit,
                                    });
                                    return ensureBundleRole(bundleDef.roleBit);
                                },
                            },
                            {
                                name: 'allocated',
                                when: () => true,
                                run: () => {
                                    $meta.checkpoint?.('role-bit-allocated', {bundleName});
                                    return ensureBundleRole();
                                },
                            },
                        ],
                    );
                    // A `$meta` that no dispatch built carries no branch helper, and the default
                    // layout then is the one the `allocated` branch states.
                    const {role: bundleRole} = decidedRole ?? (await ensureBundleRole());
                    const roleId = bundleRole.roleId;
                    const {resourceId: capabilityId} = await coreResourceEnsure<{
                        resourceId: string;
                    }>(
                        {
                            name: capabilityName,
                            typeAlias: 'access.capability',
                            table: 'access_capability',
                            extraColumns: {description: `${capabilityName} capability`},
                            keyName: 'capabilityId',
                        },
                        $meta,
                    );
                    triples.push({
                        subjectId: roleId,
                        predicateName: 'hasCapability',
                        objectId: capabilityId,
                    });

                    // 3. Bundle metadata row
                    await qb('gateway_bundle')
                        .insert({
                            bundleId: uuidBuf(roleId),
                            roleId: uuidBuf(roleId),
                            isActive: bundleDef.isActive ?? 1,
                            baseMonthlyCredits: bundleDef.baseMonthlyCredits ?? 0,
                            rateLimit: bundleDef.rateLimit ?? 0,
                            rateWindowSec: bundleDef.rateWindowSec ?? 60,
                            description: bundleDef.description ?? null,
                        })
                        .onConflict(['bundleId'])
                        .merge({
                            isActive: bundleDef.isActive ?? 1,
                            baseMonthlyCredits: bundleDef.baseMonthlyCredits ?? 0,
                            rateLimit: bundleDef.rateLimit ?? 0,
                            rateWindowSec: bundleDef.rateWindowSec ?? 60,
                            description: bundleDef.description ?? null,
                        });
                }
                $meta.checkpoint?.('bundles-merged', {
                    bundles: Object.keys(params.bundle).length,
                });
            }

            await coreTripleMerge({triples, refreshPath: true}, $meta);

            // The last point of the sequence, and the one that lands on whatever the scope emits
            // next — the response, when the dispatch records one. A point with no record after it is
            // dropped with its scope, which is why every other point here is announced *before* the
            // call that follows it.
            $meta.checkpoint?.('graph-merged', {triples: triples.length});

            return {success: true};
        },
);
