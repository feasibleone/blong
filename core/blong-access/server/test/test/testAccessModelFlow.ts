import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/**
 * server/test/test/testAccessModelFlow.ts — server-side flow for the access UI
 * model persistence handlers.
 *
 * 1. Logs in as `testAdmin` (asserts the permission map contains the access
 *    actions).
 * 2. Creates a role (`access.role.add`), reads it back (`access.role.get` —
 *    capability detail array).
 * 3. Creates a user (`access.user.add`) with the role, reads it back
 *    (`access.user.get` — credential + role detail arrays), edits it
 *    (`access.user.edit`) and lists users (`access.user.find`).
 * 4. Calls the session close action (`access.session.close`).
 * 5. Cleans up the created entities.
 *
 * Registered as the `test.access.model.flow` group (`integration.watch.test` in
 * index.ts).
 */
export default handler(
    ({
        lib: {group},
        handler: {
            loginTokenCreate,
            accessRoleAdd,
            accessRoleGet,
            accessUserAdd,
            accessUserGet,
            accessUserEdit,
            accessUserFind,
            accessSessionClose,
            accessUserRemove,
            accessRoleRemove,
        },
    }) => ({
        testAccessModelFlow: ({name = 'access model flow'}: {name?: string} = {}) =>
            group(name)([
                // 1. Authenticate via blong-access and verify the permission map.
                async function login(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await loginTokenCreate<{
                        access_token: string;
                        permissions: string[];
                    }>({username: 'testAdmin', password: 'testPassword'}, $meta);
                    assert.ok(
                        typeof result.access_token === 'string' && result.access_token.length > 0,
                        'login returns a non-empty access token',
                    );
                    assert.ok(
                        result.permissions.includes('accessTestPrivate'),
                        'testAdmin permission map includes accessTestPrivate',
                    );
                    return result;
                },

                // 2. Create a role and read it back with its capability detail.
                async function addRole(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ): Promise<{roleId: string; roleName: string}> {
                    const result = await accessRoleAdd<{role: {roleId: string; roleName: string}}>(
                        {
                            role: {
                                roleName: `MODEL-TEST-ROLE-${Date.now()}`,
                                roleBit: 998,
                                description: 'model flow test role',
                            },
                        },
                        $meta,
                    );
                    assert.ok(result.role?.roleId, 'role add succeeds');
                    return result.role;
                },

                async function getRole(
                    assert: IAssert,
                    {
                        $meta,
                        addRole: role,
                    }: {
                        $meta: IMeta;
                        addRole: Promise<{roleId: string; roleName: string}>;
                    },
                ) {
                    const created = await role;
                    const result = await accessRoleGet<{
                        role: {roleId: string; roleName: string};
                        capability: unknown[];
                    }>({roleId: created.roleId}, $meta);
                    assert.equal(
                        result.role.roleName,
                        created.roleName,
                        'role get returns roleName',
                    );
                    assert.ok(
                        Array.isArray(result.capability),
                        'role get returns capability array',
                    );
                    return created;
                },

                // 3. Create a user with the role, read it back, edit it, list it.
                async function addUser(
                    assert: IAssert,
                    {
                        $meta,
                        getRole: role,
                    }: {
                        $meta: IMeta;
                        getRole: Promise<{roleId: string; roleName: string}>;
                    },
                ) {
                    const created = await role;
                    const result = await accessUserAdd<{user: {userId: string}}>(
                        {
                            user: {
                                emailAddress: `model-test-${Date.now()}@example.com`,
                                isActive: true,
                            },
                            role: [{roleId: created.roleId}],
                        },
                        $meta,
                    );
                    assert.ok(result.user?.userId, 'user add succeeds');
                    return result.user;
                },

                async function getUserDetails(
                    assert: IAssert,
                    {
                        $meta,
                        addUser: user,
                    }: {
                        $meta: IMeta;
                        addUser: Promise<{userId: string}>;
                    },
                ) {
                    const created = await user;
                    const result = await accessUserGet<{
                        user: {userId: string};
                        credential: unknown[];
                        role: Array<{roleId: string; roleName: string}>;
                    }>({userId: created.userId}, $meta);
                    assert.equal(result.user.userId, created.userId, 'user get returns the user');
                    assert.ok(
                        Array.isArray(result.credential),
                        'user get returns credential array',
                    );
                    assert.ok(Array.isArray(result.role), 'user get returns role array');
                    return created;
                },

                async function editUser(
                    assert: IAssert,
                    {
                        $meta,
                        getUserDetails: user,
                    }: {
                        $meta: IMeta;
                        getUserDetails: Promise<{userId: string}>;
                    },
                ) {
                    const created = await user;
                    const result = await accessUserEdit<unknown>(
                        {
                            user: {userId: created.userId, isActive: false},
                        },
                        $meta,
                    );
                    assert.ok(result, 'user edit succeeds');
                    return created;
                },

                async function findUsers(
                    assert: IAssert,
                    {
                        $meta,
                        editUser: user,
                    }: {
                        $meta: IMeta;
                        editUser: Promise<{userId: string}>;
                    },
                ) {
                    const created = await user;
                    const result = await accessUserFind<
                        Array<{userId: string; emailAddress: string}>
                    >({paging: {pageNumber: 1, pageSize: 100}}, $meta);
                    assert.ok(
                        result.some(item => item.userId === created.userId),
                        'user find returns the added user',
                    );
                    return created;
                },

                // 4. Session close — revokes a (fabricated) session id.
                async function closeSession(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await accessSessionClose<{success: boolean}>(
                        {sessionId: '00000000000000000000000000000000'},
                        $meta,
                    );
                    assert.ok(result.success !== undefined, 'session close returns a result');
                    return result;
                },

                // 5. Clean up the created entities.
                async function cleanup(
                    assert: IAssert,
                    {
                        $meta,
                        findUsers: user,
                        addRole: role,
                    }: {
                        $meta: IMeta;
                        findUsers: Promise<{userId: string}>;
                        addRole: Promise<{roleId: string; roleName: string}>;
                    },
                ) {
                    const [createdUser, createdRole] = await Promise.all([user, role]);
                    await accessUserRemove({userId: createdUser.userId}, $meta);
                    await accessRoleRemove({roleId: createdRole.roleId}, $meta);
                    assert.ok(true, 'cleanup removed the created entities');
                },
            ]),
    }),
);
