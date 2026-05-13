import {handler, type IMeta} from '@feasibleone/blong';
import type Assert from 'node:assert';

import {testPassword, testUser, updatedUser} from '../fixtures/user.ts';

type UserResult = {
    id?: string;
    username?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    enabled?: boolean;
};
type CreateResult = {id: string};
type StepMeta = {$meta: IMeta};

/**
 * testKeycloakUserCrud — integration test covering Keycloak user operations:
 * add, find, get, edit, setPassword, remove.
 *
 * All users are created in the pre-existing `blong-integration` realm.
 */
export default handler(
    ({
        lib: {group},
        handler: {
            authUserAdd,
            authUserFind,
            authUserGet,
            authUserEdit,
            authUserSetPassword,
            authUserRemove,
        },
    }) => ({
        testKeycloakUserCrud: ({name = 'keycloak user CRUD'}: {name?: string}) =>
            group(name)([
                // ── 1. Clean up leftover test user if present ──────────────
                async function ensureClean(assert: typeof Assert, {$meta}: StepMeta) {
                    try {
                        const users = (await authUserFind(
                            {realm: testUser.realm, username: testUser.username},
                            $meta,
                        )) as UserResult[];
                        for (const user of users) {
                            if (user.id) await authUserRemove({realm: testUser.realm, id: user.id}, $meta);
                        }
                    } catch {
                        // ignore
                    }
                    assert.ok(true, 'pre-test cleanup completed');
                    return {cleaned: true};
                },

                // ── 2. add — create the test user ─────────────────────────
                async function addUser(
                    assert: typeof Assert,
                    {$meta, ensureClean}: StepMeta & {ensureClean: Promise<unknown>},
                ) {
                    await ensureClean;
                    const result = await authUserAdd({...testUser}, $meta);
                    assert.ok(result, 'add user returned a result');
                    assert.ok((result as CreateResult).id, 'add user returned an id');
                    return result as CreateResult;
                },

                // ── 3. find — locate the user by username ─────────────────
                async function findUser(
                    assert: typeof Assert,
                    {$meta, addUser}: StepMeta & {addUser: Promise<CreateResult>},
                ) {
                    await addUser;
                    const result = await authUserFind(
                        {realm: testUser.realm, username: testUser.username},
                        $meta,
                    );
                    assert.ok(Array.isArray(result), 'find returned an array');
                    assert.ok(
                        (result as UserResult[]).length >= 1,
                        'find returned at least one user',
                    );
                    const found = (result as UserResult[]).find(
                        u => u.username === testUser.username,
                    );
                    assert.ok(found, 'the created user is present in find results');
                    return result as UserResult[];
                },

                // ── 4. get — fetch the user by id ─────────────────────────
                async function getUser(
                    assert: typeof Assert,
                    {$meta, addUser}: StepMeta & {addUser: Promise<CreateResult>},
                ) {
                    const {id} = await addUser;
                    const result = await authUserGet({realm: testUser.realm, id}, $meta);
                    assert.ok(result, 'get user returned a result');
                    assert.strictEqual(
                        (result as UserResult).username,
                        testUser.username,
                        'get returned the correct username',
                    );
                    assert.strictEqual(
                        (result as UserResult).email,
                        testUser.email,
                        'get returned the correct email',
                    );
                    return result as UserResult & {id: string};
                },

                // ── 5. edit — update first/last name ──────────────────────
                async function editUser(
                    assert: typeof Assert,
                    {$meta, addUser}: StepMeta & {addUser: Promise<CreateResult>},
                ) {
                    const {id} = await addUser;
                    await authUserEdit(
                        {realm: testUser.realm, id, ...updatedUser},
                        $meta,
                    );
                    assert.ok(true, 'edit user completed without error');
                    return {id};
                },

                // ── 6. verify edit — re-fetch to confirm the update ────────
                async function verifyEdit(
                    assert: typeof Assert,
                    {$meta, editUser}: StepMeta & {editUser: Promise<{id: string}>},
                ) {
                    const {id} = await editUser;
                    const result = await authUserGet({realm: testUser.realm, id}, $meta);
                    assert.ok(result, 'get after edit returned a result');
                    assert.strictEqual(
                        (result as UserResult).firstName,
                        updatedUser.firstName,
                        'firstName was updated correctly',
                    );
                    assert.strictEqual(
                        (result as UserResult).lastName,
                        updatedUser.lastName,
                        'lastName was updated correctly',
                    );
                    return result as UserResult;
                },

                // ── 7. setPassword — set a password for the user ──────────
                async function setPassword(
                    assert: typeof Assert,
                    {$meta, verifyEdit, addUser}: StepMeta & {
                        verifyEdit: Promise<unknown>;
                        addUser: Promise<CreateResult>;
                    },
                ) {
                    await verifyEdit;
                    const {id} = await addUser;
                    await authUserSetPassword(
                        {realm: testUser.realm, id, password: testPassword, temporary: false},
                        $meta,
                    );
                    assert.ok(true, 'setPassword completed without error');
                    return {id, passwordSet: true};
                },

                // ── 8. remove — delete the test user ──────────────────────
                async function removeUser(
                    assert: typeof Assert,
                    {
                        $meta,
                        setPassword,
                        findUser,
                    }: StepMeta & {
                        setPassword: Promise<{id: string}>;
                        findUser: Promise<unknown>;
                    },
                ) {
                    await findUser;
                    const {id} = await setPassword;
                    await authUserRemove({realm: testUser.realm, id}, $meta);
                    assert.ok(true, 'remove user completed without error');
                    return {removed: true};
                },

                // ── 9. find — verify the user is gone ────────────────────
                async function verifyRemoval(
                    assert: typeof Assert,
                    {$meta, removeUser}: StepMeta & {removeUser: Promise<unknown>},
                ) {
                    await removeUser;
                    const result = await authUserFind(
                        {realm: testUser.realm, username: testUser.username},
                        $meta,
                    );
                    assert.ok(Array.isArray(result), 'find after removal returned an array');
                    const stillPresent = (result as UserResult[]).find(
                        u => u.username === testUser.username,
                    );
                    assert.ok(!stillPresent, 'test user is no longer in find results');
                    return result;
                },
            ]),
    }),
);
