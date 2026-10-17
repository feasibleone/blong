import {type IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';

type KnexQb = any;

/**
 * `access.user.get` — user profile + credential rows + granted roles.
 *
 * The standard user row comes from the automatic knex CRUD (`super.exec`).
 * The `credential` rows are joined manually: `access_credential.userId` is a
 * FK to `core.resource.resourceId` (not `access.user.userId`), so the generic
 * master-detail does not attach them. The granted roles come from the
 * `hasRole` graph edges (`core_triple`), and `effective` carries the user's
 * effective ACL (explicit rules plus the units/roles they are inherited
 * through) for the read-only Access tab. `matrix` carries the same rules as the
 * editable scope × CRUD grid (see `syncAclMatrix`).
 */
export default handler(
    ({
        lib: {aclMatrixRows, binHex, bufToBase64, edgeRowsWithNames, listCredentials},
        handler: {accessAclList},
    }) => ({
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
            const hex = binHex(params.userId ?? user.userId);
            if (hex) {
                result.user = {
                    ...user,
                    userId: bufToBase64(user.userId),
                };
                result.credential = await listCredentials(qb, hex);
                result.role = await edgeRowsWithNames(
                    qb,
                    hex,
                    'hasRole',
                    'access_role',
                    'roleId',
                    'roleName',
                );
                result.effective = (
                    await accessAclList<{items: Array<Record<string, unknown>>}>(
                        {principalType: 'user', principalId: bufToBase64(user.userId)},
                        $meta,
                    )
                ).items;
                result.matrix = await aclMatrixRows(qb, hex);
            }
            return result;
        },
    }),
);
