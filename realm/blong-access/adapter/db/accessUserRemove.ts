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
    async accessUserRemove(params: {userId?: string}, $meta: IMeta): Promise<{success: boolean}> {
        const qb: KnexQb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const hex = model.binHex(params.userId);
        if (!hex) return {success: true};
        const buf = Buffer.from(hex, 'hex');
        const roleIds = await model.listEdgeObjectIds(qb, hex, 'hasRole');
        // One transaction, and one rebuild at the end of it: the paths lose the
        // user only if its edges really are gone, and a failure leaves neither half
        // applied.  The rebuild comes before the `core_resource` delete because
        // `core_path` holds a foreign key to it.
        await qb.transaction(async (trx: KnexQb) => {
            if (roleIds.length) {
                await trx('core_triple')
                    .where('subjectId', buf)
                    .where('predicateName', 'hasRole')
                    .del();
            }
            await trx('access_credential').where('userId', buf).del();
            await trx('access_session').where('userId', buf).del();
            await trx('access_user').where('userId', buf).del();
            if (roleIds.length) await trx.raw('CALL access_pathRefresh()');
            await trx('core_resource').where('resourceId', buf).del();
        });
        return {success: true};
    },
}));
