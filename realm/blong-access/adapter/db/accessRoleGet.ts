import {type IMeta, handler} from '@feasibleone/blong';

import * as model from './accessModel.ts';

type KnexQb = any;

/**
 * `access.role.get` — the role row plus its **effective ACL**: the explicit
 * `access_acl` rules that apply to the role and the implicit `hasScope` grants
 * it holds, each explained as a row (`source`, `effect`, names). `matrix`
 * carries the same scope-level rules as the editable scope × CRUD grid (see
 * `syncAclMatrix`).
 *
 * The role row itself comes from the automatic knex CRUD (`super.exec`); the
 * effective rows are the same ones `access.acl.list` reports, so the read-only
 * "Access" tab of the role page and the API agree by construction.
 */
export default handler(({handler: {accessAclList}}) => ({
    async accessRoleGet(params: {roleId?: string}, $meta: IMeta): Promise<Record<string, unknown>> {
        const qb: KnexQb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const result = (await super.exec(params, $meta)) as Record<string, unknown>;
        const role = (result.role ?? {}) as {roleId?: string};
        const principalId = params.roleId ?? role.roleId;
        if (principalId) {
            const acl = await accessAclList<{items: Array<Record<string, unknown>>}>(
                {principalType: 'role', principalId},
                $meta,
            );
            result.effective = acl.items;
            result.matrix = await model.aclMatrixRows(qb, principalId);
        }
        return result;
    },
}));
