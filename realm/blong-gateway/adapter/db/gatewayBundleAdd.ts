import {type IMeta, handler} from '@feasibleone/blong';

import {newUuid, uuidBuf} from './gatewayUuid.ts';

type KnexQb = any;

/**
 * Create a single bundle through the management UI.
 *
 * Wire: `gateway.bundle.add` — a bundle wraps an `access.role` (bundleId ===
 * roleId), so the generic CRUD `add` cannot express it (roleId is required).
 * This handler ensures a fresh role resource (unique name + allocated roleBit)
 * through the shared `access.role.ensure` helper and inserts the bundle row
 * reusing that role's resource id, making the bundle create/edit pages work
 * end-to-end.
 */
export default handler(
    ({handler: {'db/accessRoleEnsure': accessRoleEnsure}}) =>
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

            // A bundle IS a role: ensure a fresh role resource (unique name, the
            // bit allocated by the framework); the bundle row reuses its id.
            const bundleName = `bundle-${newUuid()}`;
            const {role: bundleRole} = await accessRoleEnsure<{role: {roleId: string}}>(
                {role: {roleName: bundleName, description: `${bundleName} bundle role`}},
                $meta,
            );
            const roleId = bundleRole.roleId;

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
