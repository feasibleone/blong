import {type IMeta, handler} from '@feasibleone/blong';

import * as model from './accessModel.ts';

type KnexQb = any;

/**
 * `access.dropdown.list` — the auto-bound per-table dropdowns plus the
 * `access.crudEntity` list backing the capability action pivot, and the two ACL
 * lists used by the ACL pages.
 *
 * The base dropdowns (`access.user`, `access.role`, `access.capability`,
 * `access.action`, …) come from `super.exec` (the knex adapter's generic
 * dropdown handler). The `access.crudEntity` dropdown derives the distinct
 * `access<Entity>` prefixes of every standard-CRUD action registered in
 * `access_action`, so the capability pivot can list one row per entity with
 * the CRUD verbs (`find`/`get`/`add`/`edit`/`remove`) as columns.
 *
 * `access.aclPrincipal` / `access.aclTarget` list the graph resources an ACL
 * rule can name, labelled `<short type>: <name>` — principals are the users,
 * roles, units and capabilities the rules hang off; targets are the records and
 * scopes they point at.
 */
export default handler(() => ({
    async accessDropdownList(
        params: Record<string, unknown>,
        $meta: IMeta,
    ): Promise<Record<string, unknown>> {
        const qb: KnexQb = this.config?.context?.queryBuilder;
        const base = (await super.exec({}, $meta)) as Record<string, unknown>;
        if (!qb) return base;
        const rows = (await qb('access_action as a')
            .join('core_resource as r', 'r.resourceId', 'a.actionId')
            .select('r.resourceName as actionName')) as Array<{actionName: string}>;
        const entities = new Set<string>();
        for (const row of rows) {
            const parts = model.crudActionParts(row.actionName ?? '');
            if (parts) entities.add(parts.entity);
        }
        return {
            ...base,
            'access.crudEntity': [...entities].sort().map(name => ({value: name, label: name})),
            'access.aclPrincipal': await model.resourceOptions(qb, [
                'access.user',
                'access.role',
                'party.unit',
                'access.capability',
            ]),
            'access.aclTarget': await model.resourceOptions(qb, [
                'party.unit',
                'party.organization',
                'party.person',
                'access.role',
                'access.user',
                // The wildcard rule target: a rule anchored on it matches every
                // record (`targetKind: 'all'`).
                'access.any',
            ]),
        };
    },
}));
