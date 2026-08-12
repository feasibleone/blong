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

            // 1. Capabilities + their actions
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
                    }
                }
            }

            // 2. Roles + their capabilities
            if (params.role) {
                for (const [roleName, capabilityList] of Object.entries(params.role)) {
                    const {resourceId: roleId} = await coreResourceEnsure<{resourceId: string}>(
                        {
                            name: roleName,
                            typeAlias: 'access.role',
                            table: 'access_role',
                            extraColumns: {
                                roleBit: await nextRoleBit(qb),
                                description: `${roleName} role`,
                            },
                            keyName: 'roleId',
                        },
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
                            subjectId: roleId,
                            predicateName: 'hasCapability',
                            objectId: capabilityId,
                        });
                    }
                }
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

                    // 2. Role (the bundle) + hasCapability edges
                    const roleBit = bundleDef.roleBit ?? (await nextRoleBit(qb));
                    const {resourceId: roleId} = await coreResourceEnsure<{resourceId: string}>(
                        {
                            name: bundleName,
                            typeAlias: 'access.role',
                            table: 'access_role',
                            extraColumns: {roleBit, description: `${bundleName} bundle role`},
                            keyName: 'roleId',
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
            }

            await coreTripleMerge({triples, refreshPath: true}, $meta);

            return {success: true};
        },
);

/** Allocate the next free roleBit (1..1023). */
async function nextRoleBit(qb: KnexQb): Promise<number> {
    const row = await qb('access_role').max('roleBit as maxBit').first();
    const next = (Number(row?.maxBit) ?? 0) + 1;
    if (next > 1023) throw new Error('Role bit space exhausted');
    return next;
}
