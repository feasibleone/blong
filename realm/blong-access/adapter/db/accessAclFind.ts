import {type IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';

type KnexQb = any;

/**
 * `access.acl.find` — the ACL rule list with the principal, action and target
 * names joined in, so the exceptions page is readable without an extra lookup
 * per row.  The row shape itself comes from the generic CRUD (`super.exec`); the
 * names are virtual fields resolved here (`${principal}Name`, `actionName`,
 * `${target}Name`).
 *
 * The generic read answers either a bare page or `{items, pagination}`, and the
 * browse table always asks for the counted shape (`paging.count`). The names are
 * attached to the rows whatever the shape is — attaching them to the envelope
 * found no rows to name and left every display column empty. @@F-723
 */
export default handler(({lib: {attachAclNames}}) => ({
    async accessAclFind(params: Record<string, unknown>, $meta: IMeta): Promise<unknown> {
        const qb: KnexQb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const result = await super.exec(params, $meta);
        if (Array.isArray(result))
            return attachAclNames(qb, result as Array<Record<string, unknown>>);
        const {items, ...rest} = result as {items?: Array<Record<string, unknown>>};
        return items ? {...rest, items: await attachAclNames(qb, items)} : result;
    },
}));
