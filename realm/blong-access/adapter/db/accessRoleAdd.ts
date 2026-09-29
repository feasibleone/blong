import {type IMeta, handler} from '@feasibleone/blong';

import * as model from './accessModel.ts';
import * as account from './account.ts';

type KnexQb = any;

/**
 * `access.role.add` — create a role (resource + `access_role` row) plus its
 * record-level ACL.
 *
 * Reuses `core.resource.ensure` to create the resource-backed row (the generic
 * knex `add` cannot — the PK is `uidNotNull`, not `uuid()`). When the form
 * submitted a `matrix` (the tri-state scope × CRUD grid of the Access tab), the
 * `access_acl` rules of the new role are written by `syncAclMatrix`.
 */
export default handler(
    ({handler: {'db/accessRoleEnsure': accessRoleEnsure}, lib: {ulid, crockfordDecode}}) => ({
        async accessRoleAdd(
            params: {
                role?: {roleName?: string; roleBit?: number | string | null; description?: string};
                matrix?: model.AclMatrixRow[];
            },
            $meta: IMeta,
        ): Promise<Record<string, unknown>> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');
            // `access.role.ensure` allocates the bit when the form leaves it
            // blank and refuses one taken by another role — the returned bit is
            // the one the role actually owns (a bit never moves).
            const {role: created} = await accessRoleEnsure<model.EnsuredRole>(
                {role: params.role},
                $meta,
            );
            const roleHex = model.binHex(created.roleId);
            if (!roleHex) throw new Error('Could not resolve role resource id');
            if (Array.isArray(params.matrix) && params.matrix.length) {
                await model.syncAclMatrix(
                    qb,
                    {
                        // `core.resource.ensure` lives in `core`, a library realm this
                        // process carries itself: `super` reaches it in the same process,
                        // and the helper has no `super` of its own, so the binding is
                        // closed over here.
                        coreResourceEnsure: (p: any, m: IMeta) => super.coreResourceEnsure(p, m),
                        newAclId: () => Buffer.from(crockfordDecode(ulid())),
                    },
                    roleHex,
                    params.matrix,
                    $meta,
                );
            }
            return {
                role: {
                    roleId: model.bufToBase64(account.uuidBuf(created.roleId)),
                    roleName: created.roleName,
                    roleBit: created.roleBit,
                    description: params.role?.description ?? null,
                },
            };
        },
    }),
);
