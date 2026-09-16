import {type IMeta, handler} from '@feasibleone/blong';

/** Fields joined for display by `access.acl.find` / `.get` — never persisted. */
const VIRTUAL_FIELDS = ['principalName', 'actionName', 'targetName'];

/**
 * `access.acl.add` — create an ACL rule.
 *
 * The write itself is the generic CRUD (`super.exec`); this handler only removes
 * the virtual display fields the editor round-trips and supplies the `ulid`
 * marker for `aclId`, whose value the adapter generates — an ACL rule is
 * identified by its own ULID rather than by a `core.resource` row.
 */
export default handler(() => ({
    async accessAclAdd(
        params: {acl?: Record<string, unknown>} & Record<string, unknown>,
        $meta: IMeta,
    ): Promise<unknown> {
        const acl = {...(params.acl ?? {})};
        for (const field of VIRTUAL_FIELDS) delete acl[field];
        if (!acl.aclId) acl.aclId = 'ulid';
        return super.exec({...params, acl}, $meta);
    },
}));
