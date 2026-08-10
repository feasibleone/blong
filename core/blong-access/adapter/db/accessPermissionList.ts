import {type IMeta, handler} from '@feasibleone/blong';

import {uuidBuf} from './account.ts';

type KnexQb = any;

/**
 * Resolve a user's effective role bits and action names from the materialized
 * `core_path` (`access.effectiveRole` / `access.effectiveAction`) and pack the
 * role bits into a base64 `permissionMap` bitmask (roleBit 0–1023).
 *
 * Wire: `access.permission.list` — shared RBAC helper in the `access.db`
 * handler group, reused by credential check and identity resolution.
 */
export default handler(
    () =>
        async function accessPermissionList(
            params: {userId: string},
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _$meta: IMeta,
        ): Promise<{roleBits: number[]; actions: string[]; permissionMap: string}> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');

            const userId = uuidBuf(params.userId);

            const roles = await qb
                .select('r.roleBit')
                .from('access_role as r')
                .join('core_path as p', 'p.destinationId', 'r.roleId')
                .where('p.originId', userId)
                .where('p.pathType', 'access.effectiveRole');

            const roleBits: number[] = roles.map((r: {roleBit: number}) => r.roleBit);

            const actions = await qb
                .select('res.resourceName')
                .from('core_resource as res')
                .join('core_path as p', 'p.destinationId', 'res.resourceId')
                .where('p.originId', userId)
                .where('p.pathType', 'access.effectiveAction');

            const actionNames: string[] = actions.map((a: {resourceName: string}) => a.resourceName);

            const maxRoleBit = roleBits.length ? Math.max(...roleBits) : 0;
            if (maxRoleBit > 1023) throw new Error('Role bit exceeds maximum allowed value of 1023');

            const permissionMap: string = Buffer.from(
                roleBits.reduce(
                    (acc, bit) => {
                        const byteIndex = Math.floor(bit / 8);
                        const bitIndex = bit % 8;
                        acc[byteIndex] |= 1 << bitIndex;
                        return acc;
                    },
                    new Uint8Array(Math.ceil(maxRoleBit / 8 + 1)),
                ),
            ).toString('base64');

            return {roleBits, actions: actionNames, permissionMap};
        },
);
