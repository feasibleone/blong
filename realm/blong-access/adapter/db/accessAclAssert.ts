import {type IMeta, handler} from '@feasibleone/blong';

import {type AclCheckVerdict, type AclHost} from './accessModel.ts';

/**
 * `access.acl.assert` — gate one record (or the scope a new record is created
 * in) against the effective ACL, throwing the realm's `acl.*` error family.
 *
 * The adapter owns the SQL (`aclCheck`, shared with the generic CRUD) and this
 * handler owns the realm semantics: which predicate refuses with 404 rather than
 * 403, and which error family is raised.  Realm handlers call it through the
 * handler proxy before touching a guarded record:
 *
 * ```ts
 * await handler.accessAclAssert({recordId: params.invoiceId, predicate: 'edit'}, $meta);
 * ```
 *
 * `guarded: false` in the result means the entity does not opt into the ACL (or
 * the action is not RBAC-managed) — the caller is free to proceed, which is why
 * the verdict is returned rather than only thrown on.
 */
export default handler(({errors}) => ({
    async accessAclAssert(
        params: {
            /** Guarded entity as `subject.object` — defaults to the entity of the action. */
            entity?: string;
            /** The action to check — defaults to `$meta.method`. */
            action?: string;
            /** Binary record key (base64/hex) for a single-record check. */
            recordId?: string;
            /** Scope ids (base64/hex) for an `add` check. */
            scopeIds?: string[];
            /** The predicate being performed — `get` reports a denial as not-found. */
            predicate?: string;
        },
        $meta: IMeta,
    ): Promise<AclCheckVerdict> {
        const adapter = this as unknown as AclHost;
        const verdict = await adapter.aclCheck(
            {
                entity: params.entity,
                method: params.action ?? $meta.method,
                recordId: params.recordId,
                scopeIds: params.scopeIds,
            },
            $meta,
        );
        if (verdict.allowed) return verdict;
        // A denied single-record read reports "not found", so the caller cannot
        // probe for the existence of records it may not see; lists simply omit
        // them.  Everything else is an explicit refusal.
        if (params.predicate === 'get') {
            throw errors.aclNotFound({params: {reason: 'notFound'}});
        }
        if (params.scopeIds?.length) {
            throw errors.aclScopeDenied({params: {reason: 'scopeDenied'}});
        }
        throw errors.aclDenied({params: {reason: 'denied'}});
    },
}));
