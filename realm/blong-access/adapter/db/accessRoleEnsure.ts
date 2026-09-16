import {type IMeta, handler} from '@feasibleone/blong';

import * as model from './accessModel.ts';
import * as account from './account.ts';

/**
 * `access.role.ensure` — the **one door** for creating a role: it creates the
 * `access_role` resource + row, or returns the existing role, and **allocates
 * the `roleBit` when the caller does not supply one**.
 *
 * Every role creation path goes through here — registration
 * (`access.account.add`), the authorization merge, the model's add, the seed
 * merge (`access.role.merge`) and the gateway bundles — because
 * `access_role.roleBit` is UNIQUE while the raw `core.resource.ensure` needs a
 * value for it.  Callers that hardcoded a bit (or used `0` to mean "I do not
 * care") were silently skipped by `INSERT IGNORE`, which left a role resource
 * with no role row: a role that cannot be browsed, edited or deleted, and whose
 * name is then taken for good (T-102 — before `INSERT IGNORE` the same clash
 * *overwrote* Admin, see F-115).
 *
 * The rules this handler enforces:
 *
 * - **Blank means allocate** — `MAX(roleBit) + 1`, never reused.  A bit is the
 *   role's position in a minted token's `per` mask, so a freed bit must not be
 *   handed to a new role while old tokens still carry it.
 * - **An explicit bit is honoured or refused** — a bit owned by *another* role
 *   raises `role.bitTaken`, an out-of-range or non-numeric one `role.bitInvalid`.
 * - **A bit never moves** — an existing role keeps the bit it has, whatever the
 *   caller asks for, and the row is read back so the caller learns the real one.
 *
 * Wire: `access.role.ensure` — shared helper in the `access.db` handler group.
 */
export default handler(({errors, handler: {'db/coreResourceEnsure': coreResourceEnsure}}) => ({
    async accessRoleEnsure(
        params: {
            role?: {
                roleName?: string;
                /** Explicit role bit (0–1023); blank or absent asks for an allocated one. */
                roleBit?: number | string | null;
                description?: string;
            };
        },
        $meta: IMeta,
    ): Promise<{role: {roleId: string; roleName: string; roleBit: number}}> {
        const qb: any = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const role = params.role ?? {};
        const roleName = role.roleName || `role-${Date.now()}`;
        const blank = role.roleBit === undefined || role.roleBit === null || role.roleBit === '';
        const requested = blank ? undefined : Number(role.roleBit);
        if (
            requested !== undefined &&
            (!Number.isInteger(requested) || requested < 0 || requested > model.ROLE_BIT_MAX)
        ) {
            throw errors.roleBitInvalid({params: {roleBit: String(role.roleBit)}});
        }
        if (requested !== undefined) {
            const owner = (await qb('access_role as r')
                .join('core_resource as res', 'res.resourceId', 'r.roleId')
                .where('r.roleBit', requested)
                .first('res.resourceName as roleName')) as {roleName?: string} | undefined;
            // The same role re-declared with its own bit is not a conflict —
            // only a bit owned by a *different* role is.
            if (owner?.roleName && owner.roleName !== roleName) {
                throw errors.roleBitTaken({
                    params: {roleBit: requested, roleName: String(owner.roleName)},
                });
            }
        }
        const {resourceId} = await coreResourceEnsure<{resourceId: string}>(
            {
                name: roleName,
                typeAlias: 'access.role',
                table: 'access_role',
                keyName: 'roleId',
                extraColumns: {
                    description: role.description ?? `${roleName} role`,
                    ...(requested === undefined ? {} : {roleBit: requested}),
                },
                // No bit submitted → the framework allocates one and fails
                // loudly if the row still cannot be written.
                allocate: {column: 'roleBit', max: model.ROLE_BIT_MAX},
            },
            $meta,
        );
        const row = (await qb('access_role')
            .where('roleId', account.uuidBuf(resourceId))
            .first('roleBit')) as {roleBit?: number | null} | undefined;
        if (row?.roleBit === undefined || row.roleBit === null) {
            throw new Error(`The role "${roleName}" has no access_role row after ensure`);
        }
        return {role: {roleId: resourceId, roleName, roleBit: Number(row.roleBit)}};
    },
}));
