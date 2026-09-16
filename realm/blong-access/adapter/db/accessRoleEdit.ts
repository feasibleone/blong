import {type IMeta, handler} from '@feasibleone/blong';

import * as model from './accessModel.ts';

type KnexQb = any;

/**
 * `access.role.edit` — update a role's columns, display name and record-level
 * ACL.
 *
 * The standard `access_role` update runs through `super.exec` (the virtual
 * `roleName` field is stripped — it lives in `core_resource`). The display name
 * is updated when submitted, and the role's scope-level `access_acl` rules are
 * brought in line with the submitted `matrix` (when present) — the tri-state
 * scope × CRUD grid of the Access tab, where an empty cell removes the rule and
 * therefore releases whatever the hierarchy granted implicitly.
 */
export default handler(
    ({
        errors,
        handler: {'db/coreResourceEnsure': coreResourceEnsure},
        lib: {ulid, crockfordDecode},
    }) => ({
        async accessRoleEdit(
            params: {
                role?: {
                    roleId?: string;
                    roleName?: string;
                    roleBit?: number | string | null;
                    description?: string;
                };
                matrix?: model.AclMatrixRow[];
            },
            $meta: IMeta,
        ): Promise<unknown> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');
            const {role = {}, matrix} = params;
            const {roleName, ...roleColumns} = role;
            // A bit never moves: it is the role's position in the permission mask
            // of already-minted tokens, so re-pointing it would silently change
            // what those tokens authorize.  A form that posts the loaded bit is
            // fine; a different one is refused.
            const hex = model.binHex(role.roleId);
            if (!hex) throw new Error('Invalid role id');
            const submitted = role.roleBit;
            const blank = submitted === undefined || submitted === null || submitted === '';
            if (!blank) {
                const requested = Number(submitted);
                const stored = (await qb('access_role')
                    .where('roleId', Buffer.from(hex, 'hex'))
                    .first('roleBit')) as {roleBit?: number} | undefined;
                if (stored?.roleBit !== undefined && Number(stored.roleBit) !== requested) {
                    throw errors.roleBitImmutable({
                        params: {roleName: roleName ?? hex, roleBit: Number(stored.roleBit)},
                    });
                }
            }
            // The bit is not a writable column of the row: drop it either way
            // (the stored value is the authority).
            delete roleColumns.roleBit;
            // A matrix-only save submits the PK alone — there is nothing to
            // update on the row, and an empty `update()` is rejected by the
            // adapter.
            const touched = Object.keys(roleColumns).filter(key => key !== 'roleId');
            const result = touched.length
                ? await super.exec({...params, role: roleColumns}, $meta)
                : {role: {roleId: role.roleId}};
            if (typeof roleName === 'string') {
                await qb('core_resource')
                    .where('resourceId', Buffer.from(hex, 'hex'))
                    .update({resourceName: roleName});
            }
            if (Array.isArray(matrix)) {
                await model.syncAclMatrix(
                    qb,
                    {
                        coreResourceEnsure,
                        newAclId: () => Buffer.from(crockfordDecode(ulid())),
                    },
                    hex,
                    matrix,
                    $meta,
                );
            }
            return result;
        },
    }),
);
