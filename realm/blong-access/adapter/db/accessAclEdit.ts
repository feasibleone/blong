import {type IMeta, handler} from '@feasibleone/blong';

/** Fields joined for display by `access.acl.find` / `.get` — never persisted. */
const VIRTUAL_FIELDS = ['principalName', 'actionName', 'targetName'];

/**
 * `access.acl.edit` — update an ACL rule.
 *
 * The write is the generic CRUD (`super.exec`); this handler only drops the
 * virtual display fields the editor round-trips, so they never reach the table.
 */
export default handler(() => ({
    async accessAclEdit(
        params: {acl?: Record<string, unknown>} & Record<string, unknown>,
        $meta: IMeta,
    ): Promise<unknown> {
        const acl = {...(params.acl ?? {})};
        for (const field of VIRTUAL_FIELDS) delete acl[field];
        return super.exec({...params, acl}, $meta);
    },
}));
