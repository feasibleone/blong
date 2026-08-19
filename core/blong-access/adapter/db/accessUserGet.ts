import {type IMeta, handler} from '@feasibleone/blong';

import * as model from './accessModel.ts';

type KnexQb = any;

/**
 * `access.user.get` — user profile + credential rows + granted roles.
 *
 * The standard user row comes from the automatic knex CRUD (`super.exec`).
 * The `credential` rows are joined manually: `access_credential.userId` is a
 * FK to `core.resource.resourceId` (not `access.user.userId`), so the generic
 * master-detail does not attach them. The granted roles come from the
 * `hasRole` graph edges (`core_triple`).
 */
export default handler(() => ({
    async accessUserGet(
        params: {userId?: string},
        $meta: IMeta,
    ): Promise<Record<string, unknown>> {
        const qb: KnexQb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const result = (await super.exec(params, $meta)) as Record<string, unknown>;
        const user = (result.user ?? {}) as {
            userId?: string;
            emailAddress?: string;
            isActive?: boolean;
        };
        const hex = model.binHex(params.userId ?? user.userId);
        if (hex) {
            result.user = {
                ...user,
                userId: model.bufToBase64(user.userId),
            };
            result.credential = await model.listCredentials(qb, hex);
            result.role = await model.edgeRowsWithNames(
                qb,
                hex,
                'hasRole',
                'access_role',
                'roleId',
                'roleName',
            );
        }
        return result;
    },
}));
