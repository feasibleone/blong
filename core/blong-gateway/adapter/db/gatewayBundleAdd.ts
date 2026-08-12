import {type IMeta, handler} from '@feasibleone/blong';

import {newUuid, uuidBuf} from './gatewayUuid.ts';

type KnexQb = any;

/**
 * Create a single bundle through the management UI.
 *
 * Wire: `gateway.bundle.add` — a bundle wraps an `access.role` (bundleId ===
 * roleId), so the generic CRUD `add` cannot express it (roleId is required).
 * This handler ensures a fresh role resource (unique name + next roleBit) via
 * the shared `core.resource.ensure` helper and inserts the bundle row reusing
 * that role's resource id, making the bundle create/edit pages work end-to-end.
 */
export default handler(
    ({handler: {'db/coreResourceEnsure': coreResourceEnsure}}) =>
        async function gatewayBundleAdd(
            params: {bundle?: Record<string, unknown>},
            $meta: IMeta,
        ): Promise<{bundle: Record<string, unknown>}> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');

            const data = (params.bundle ?? {}) as {
                baseMonthlyCredits?: number;
                rateLimit?: number;
                rateWindowSec?: number;
                description?: string | null;
                isActive?: boolean | number;
            };

            // A bundle IS a role: ensure a fresh role resource (unique name +
            // next roleBit); the bundle row reuses its resource id.
            const bundleName = `bundle-${newUuid()}`;
            const {resourceId: roleId} = await coreResourceEnsure<{resourceId: string}>(
                {
                    name: bundleName,
                    typeAlias: 'access.role',
                    table: 'access_role',
                    extraColumns: {
                        roleBit: await nextRoleBit(qb),
                        description: `${bundleName} bundle role`,
                    },
                    keyName: 'roleId',
                },
                $meta,
            );

            await qb('gateway_bundle').insert({
                bundleId: uuidBuf(roleId),
                roleId: uuidBuf(roleId),
                isActive: data.isActive ? 1 : 0,
                baseMonthlyCredits: data.baseMonthlyCredits ?? 0,
                rateLimit: data.rateLimit ?? 0,
                rateWindowSec: data.rateWindowSec ?? 60,
                description: data.description ?? null,
            });

            return {
                bundle: {
                    bundleId: roleId,
                    roleId,
                    isActive: data.isActive ? 1 : 0,
                    baseMonthlyCredits: data.baseMonthlyCredits ?? 0,
                    rateLimit: data.rateLimit ?? 0,
                    rateWindowSec: data.rateWindowSec ?? 60,
                    description: data.description ?? null,
                },
            };
        },
);

/** Allocate the next free roleBit (1..1023). */
async function nextRoleBit(qb: KnexQb): Promise<number> {
    const row = await qb('access_role').max('roleBit as maxBit').first();
    const next = (Number(row?.maxBit) ?? 0) + 1;
    if (next > 1023) throw new Error('Role bit space exhausted');
    return next;
}
