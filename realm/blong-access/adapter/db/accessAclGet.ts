import {type IMeta, handler} from '@feasibleone/blong';

import * as model from './accessModel.ts';

type KnexQb = any;

/**
 * `access.acl.get` — one ACL rule (the generic CRUD row) with the principal,
 * action and target names joined in, so the editor shows what the ids mean.
 */
export default handler(() => ({
    async accessAclGet(params: {aclId?: string}, $meta: IMeta): Promise<Record<string, unknown>> {
        const qb: KnexQb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const result = (await super.exec(params, $meta)) as Record<string, unknown>;
        const rows = await model.attachAclNames(qb, [
            (result.acl ?? {}) as Record<string, unknown>,
        ]);
        return {acl: rows[0]};
    },
}));
