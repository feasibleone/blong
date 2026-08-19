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
        if (actionIds.length) {
            await qb('core_triple')
                .where('subjectId', buf)
                .where('predicateName', 'hasAction')
                .del();
            await qb.raw('CALL access_pathRefresh()');
        }
        // A capability can be granted to roles — remove those edges too.
        await qb('core_triple')
            .where('objectId', buf)
            .where('predicateName', 'hasCapability')
            .del();
        await qb('access_capability').where('capabilityId', buf).del();
        await qb('core_resource').where('resourceId', buf).del();
        return {success: true};
    },
}));
