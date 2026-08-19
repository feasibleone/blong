import {type IMeta, handler} from '@feasibleone/blong';

import * as model from './accessModel.ts';

type KnexQb = any;

/**
 * `access.user.remove` — delete a user and everything that references it.
 *
 * Removes the `hasRole` graph edges (refreshing the materialized path), the
 * credential rows, any session rows, the `access_user` row and finally the
 * `core_resource` row.
 */
export default handler(() => ({
    async accessUserRemove(
        params: {userId?: string},
        $meta: IMeta,
    ): Promise<{success: boolean}> {
        const qb: KnexQb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const hex = model.binHex(params.userId);
        if (!hex) return {success: true};
        const buf = Buffer.from(hex, 'hex');
        const roleIds = await model.listEdgeObjectIds(qb, hex, 'hasRole');
        if (roleIds.length) {
            await qb('core_triple')
                .where('subjectId', buf)
                .where('predicateName', 'hasRole')
                .del();
            await qb.raw('CALL access_pathRefresh()');
        }
        await qb('access_credential').where('userId', buf).del();
        await qb('access_session').where('userId', buf).del();
        await qb('access_user').where('userId', buf).del();
        await qb('core_resource').where('resourceId', buf).del();
        return {success: true};
    },
}));
