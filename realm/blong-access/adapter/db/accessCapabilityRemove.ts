import {type IMeta, handler} from '@feasibleone/blong';

import * as model from './accessModel.ts';

type KnexQb = any;

/**
 * `access.capability.remove` — delete a capability, its graph edges and its
 * resource row.
 */
export default handler(() => ({
    async accessCapabilityRemove(
        params: {capabilityId?: string},
        $meta: IMeta,
    ): Promise<{success: boolean}> {
        const qb: KnexQb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const hex = model.binHex(params.capabilityId);
        if (!hex) return {success: true};
        const buf = Buffer.from(hex, 'hex');
        const actionIds = await model.listEdgeObjectIds(qb, hex, 'hasAction');
        // One transaction, one rebuild at the end of it.  The old shape rebuilt the
        // paths after removing the `hasAction` edges and then removed the
        // granted-to-role `hasCapability` edges, so those grants stayed in every
        // caller's paths until some later rebuild happened — and nothing recorded
        // that they were stale.  The rebuild also has to precede the
        // `core_resource` delete, because `core_path` holds a foreign key to it.
        await qb.transaction(async (trx: KnexQb) => {
            if (actionIds.length) {
                await trx('core_triple')
                    .where('subjectId', buf)
                    .where('predicateName', 'hasAction')
                    .del();
            }
            // A capability can be granted to roles — remove those edges too.
            await trx('core_triple')
                .where('objectId', buf)
                .where('predicateName', 'hasCapability')
                .del();
            await trx('access_capability').where('capabilityId', buf).del();
            await trx.raw('CALL access_pathRefresh()');
            await trx('core_resource').where('resourceId', buf).del();
        });
        return {success: true};
    },
}));
