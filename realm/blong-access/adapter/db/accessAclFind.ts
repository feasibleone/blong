import {type IMeta, handler} from '@feasibleone/blong';

import * as model from './accessModel.ts';

type KnexQb = any;

/**
 * `access.acl.find` — the ACL rule list with the principal, action and target
 * names joined in, so the exceptions page is readable without an extra lookup
 * per row.  The row shape itself comes from the generic CRUD (`super.exec`); the
 * names are virtual fields resolved here (`${principal}Name`, `actionName`,
 * `${target}Name`).
 */
export default handler(() => ({
    async accessAclFind(params: Record<string, unknown>, $meta: IMeta): Promise<unknown> {
        const qb: KnexQb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const rows = (await super.exec(params, $meta)) as Array<Record<string, unknown>>;
        return model.attachAclNames(qb, rows);
    },
}));
