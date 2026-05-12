import {handler, type IMeta} from '@feasibleone/blong';
import type Assert from 'node:assert';

import {testRole, updatedRole} from '../fixtures/role.ts';

type RoleResult = {id?: string; name?: string; description?: string};
type StepMeta = {$meta: IMeta};

/**
 * testKeycloakRoleCrud — integration test covering Keycloak realm role operations:
 * add, find, get, edit, remove.
 *
 * All roles are created in the pre-existing `blong-integration` realm.
 */
export default handler(
    ({
        lib: {group},
        handler: {authRoleAdd, authRoleFind, authRoleGet, authRoleEdit, authRoleRemove},
    }) => ({
        testKeycloakRoleCrud: ({name = 'keycloak role CRUD'}: {name?: string}) =>
            group(name)([
                // ── 1. Clean up leftover test role if present ──────────────
                async function ensureClean(assert: typeof Assert, {$meta}: StepMeta) {
                    try {
                        await authRoleRemove(
                            {realm: testRole.realm, roleName: testRole.roleName},
                            $meta,
                        );
                    } catch {
                        // ignore – role may not exist
                    }
                    assert.ok(true, 'pre-test cleanup completed');
                    return {cleaned: true};
                },

                // ── 2. add — create the test role ─────────────────────────
                async function addRole(
                    assert: typeof Assert,
                    {$meta, ensureClean}: StepMeta & {ensureClean: Promise<unknown>},
                ) {
                    await ensureClean;
                    const result = await authRoleAdd({...testRole}, $meta);
                    assert.ok(result !== undefined, 'add role returned a result');
                    return {roleName: testRole.roleName};
                },

                // ── 3. find — list roles and verify the new role is present
                async function findRoles(
                    assert: typeof Assert,
                    {$meta, addRole}: StepMeta & {addRole: Promise<unknown>},
                ) {
                    await addRole;
                    const result = await authRoleFind({realm: testRole.realm}, $meta);
                    assert.ok(Array.isArray(result), 'find returned an array');
                    const found = (result as RoleResult[]).find(
                        r => r.name === testRole.roleName,
                    );
                    assert.ok(found, 'the created role is present in find results');
                    return result as RoleResult[];
                },

                // ── 4. get — fetch the role by name ───────────────────────
                async function getRole(
                    assert: typeof Assert,
                    {$meta, addRole}: StepMeta & {addRole: Promise<unknown>},
                ) {
                    await addRole;
                    const result = await authRoleGet(
                        {realm: testRole.realm, roleName: testRole.roleName},
                        $meta,
                    );
                    assert.ok(result, 'get role returned a result');
                    assert.strictEqual(
                        (result as RoleResult).name,
                        testRole.roleName,
                        'get returned the correct role name',
                    );
                    assert.strictEqual(
                        (result as RoleResult).description,
                        testRole.description,
                        'get returned the correct description',
                    );
                    return result as RoleResult;
                },

                // ── 5. edit — update the role description ─────────────────
                async function editRole(
                    assert: typeof Assert,
                    {$meta, getRole}: StepMeta & {getRole: Promise<RoleResult>},
                ) {
                    await getRole;
                    await authRoleEdit(
                        {realm: testRole.realm, roleName: testRole.roleName, ...updatedRole},
                        $meta,
                    );
                    assert.ok(true, 'edit role completed without error');
                    return {roleName: testRole.roleName};
                },

                // ── 6. verify edit — re-fetch to confirm the update ────────
                async function verifyEdit(
                    assert: typeof Assert,
                    {$meta, editRole}: StepMeta & {editRole: Promise<unknown>},
                ) {
                    await editRole;
                    const result = await authRoleGet(
                        {realm: testRole.realm, roleName: testRole.roleName},
                        $meta,
                    );
                    assert.ok(result, 'get after edit returned a result');
                    assert.strictEqual(
                        (result as RoleResult).description,
                        updatedRole.description,
                        'description was updated correctly',
                    );
                    return result as RoleResult;
                },

                // ── 7. remove — delete the test role ──────────────────────
                async function removeRole(
                    assert: typeof Assert,
                    {
                        $meta,
                        verifyEdit,
                        findRoles,
                    }: StepMeta & {
                        verifyEdit: Promise<unknown>;
                        findRoles: Promise<unknown>;
                    },
                ) {
                    await verifyEdit;
                    await findRoles;
                    await authRoleRemove(
                        {realm: testRole.realm, roleName: testRole.roleName},
                        $meta,
                    );
                    assert.ok(true, 'remove role completed without error');
                    return {removed: true};
                },

                // ── 8. find — verify the role is gone ─────────────────────
                async function verifyRemoval(
                    assert: typeof Assert,
                    {$meta, removeRole}: StepMeta & {removeRole: Promise<unknown>},
                ) {
                    await removeRole;
                    const result = await authRoleFind({realm: testRole.realm}, $meta);
                    assert.ok(Array.isArray(result), 'find after removal returned an array');
                    const stillPresent = (result as RoleResult[]).find(
                        r => r.name === testRole.roleName,
                    );
                    assert.ok(!stillPresent, 'test role is no longer in find results');
                    return result;
                },
            ]),
    }),
);
