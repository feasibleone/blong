import {type IMeta, handler} from '@feasibleone/blong';

import {type EnsuredRole} from './accessModel.ts';

/**
 * `access.role.merge` — the seed form of `access.role.ensure`: one call for the
 * list of roles a seed file declares, so `meta/db/1-accessRoleMerge.yaml` can
 * name roles without maintaining a bit table.
 *
 * This overrides the generic resource merge (`resourceType: access.role`),
 * which would insert the rows as-is and therefore needs every row to carry its
 * own `roleBit` — the column is NOT NULL and UNIQUE, so a seed could only ever
 * pick numbers by hand and collide silently.
 *
 * A row may still name a `roleBit`; when it does not, the bit is allocated
 * (`MAX(roleBit) + 1` in file order).  Roles that already exist keep the bit
 * they have, so re-running a seed never moves a bit: on a fresh database the
 * first file that seeds roles reproduces the same numbering as before, while a
 * layout change in the file cannot renumber anything.
 *
 * Wire: `access.role.merge` — the realm's own merge, called by the seed loader.
 */
export default handler(({handler: {'db/accessRoleEnsure': accessRoleEnsure}}) => ({
    async accessRoleMerge(
        params: {
            /** Declared by the seed file (`access.role`); the `role` list is the payload. */
            resourceType?: string;
            role?: Array<{name?: string; roleBit?: number; description?: string}>;
        },
        $meta: IMeta,
    ): Promise<{
        success: boolean;
        role: Array<{roleId: string; name: string; roleBit: number}>;
    }> {
        const rows = params.role ?? [];
        const result: Array<{roleId: string; name: string; roleBit: number}> = [];
        for (const row of rows) {
            if (!row.name) continue;
            const {role} = await accessRoleEnsure<EnsuredRole>(
                {
                    role: {
                        roleName: row.name,
                        roleBit: row.roleBit,
                        description: row.description,
                    },
                },
                $meta,
            );
            result.push({roleId: role.roleId, name: role.roleName, roleBit: role.roleBit});
        }
        return {success: true, role: result};
    },
}));
