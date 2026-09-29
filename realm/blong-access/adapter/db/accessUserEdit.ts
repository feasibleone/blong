import {type IMeta, handler} from '@feasibleone/blong';

import * as model from './accessModel.ts';

type KnexQb = any;

/**
 * `access.user.edit` — update a user's columns plus its credential rows and
 * granted roles.
 *
 * The standard `access_user` update runs through the automatic knex CRUD
 * (`super.exec`). Credential rows are then synced (only when the form actually
 * submitted a `credential` array — otherwise they are left untouched), the
 * `hasRole` edges are brought in line with the submitted `role` array, and the
 * `matrix` array updates the user's own scope-level `access_acl` rules.
 */
export default handler(({lib: {hashPassword, credentialPolicyParams, ulid, crockfordDecode}}) => ({
    async accessUserEdit(
        params: {
            user?: {userId?: string; emailAddress?: string; isActive?: boolean};
            credential?: Array<Record<string, unknown>>;
            role?: Array<{roleId?: string; roleName?: string; granted?: boolean}>;
            matrix?: model.AclMatrixRow[];
        },
        $meta: IMeta,
    ): Promise<unknown> {
        const qb: KnexQb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const result = await super.exec(params, $meta);
        const hex = model.binHex(params.user?.userId);
        if (!hex) throw new Error('Invalid user id');
        // The entity row is the framework's own edit case, which is already one
        // transaction; everything this handler writes after it is the second, and
        // it has to be one: the credentials (several rows), the granted roles
        // (with the rebuild inside `syncEdges`) and the scope ACL matrix used to
        // commit one at a time, so a failure in the middle left an edit the caller
        // was told had failed with half of its assignments already stored.
        await qb.transaction(async (trx: KnexQb) => {
            if (Array.isArray(params.credential)) {
                await model.syncCredentials(
                    trx,
                    {hashPassword, credentialPolicyParams},
                    hex,
                    params.credential,
                );
            }
            if (Array.isArray(params.role)) {
                const roleIds = (params.role ?? [])
                    .filter(r => r.granted !== false)
                    .map(r => model.binHex(r.roleId))
                    .filter((x): x is string => !!x);
                await model.syncEdges(trx, hex, 'hasRole', roleIds);
            }
            if (Array.isArray(params.matrix)) {
                await model.syncAclMatrix(
                    trx,
                    {
                        // `core.resource.ensure` lives in `core`, a library realm
                        // this process carries itself, so `super` reaches it in
                        // the same process on the same connection — and it takes
                        // the transaction, so an ACL rule and the resource it
                        // points at are one write. The helper has no `super` of
                        // its own, so the binding is closed over here.
                        coreResourceEnsure: (p: any, m: IMeta) =>
                            super.coreResourceEnsure(p, m, trx),
                        newAclId: () => Buffer.from(crockfordDecode(ulid())),
                    },
                    hex,
                    params.matrix,
                    $meta,
                );
            }
        });
        return result;
    },
}));
