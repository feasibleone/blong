import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/**
 * server/test/test/testAccessModelFlow.ts — server-side flow for the access UI
 * model persistence handlers.
 *
 * 1. Logs in as `testAdmin` (asserts the permission map contains the access
 *    actions).
 * 2. Creates a role (`access.role.add`), reads it back (`access.role.get` —
 *    capability detail array), then proves the role-bit contract: a role added
 *    **without** a bit is allocated a real one (and it is persisted), an
 *    explicit bit owned by another role is refused (`role.bitTaken`) instead of
 *    being silently skipped, and an edit that tries to change a bit is refused
 *    (`role.bitImmutable`).
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
            accessRoleEdit,
            accessUserAdd,
            accessUserGet,
            accessUserEdit,
            accessUserFind,
            accessSessionClose,
            accessUserRemove,
            accessRoleRemove,
            accessRoleMerge,
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

                // 2b. A role created without a bit is **allocated** one.  The old
                //     path passed `roleBit: 0`, which collided with Admin and was
                //     silently dropped by `INSERT IGNORE` — leaving a role resource
                //     with no role row, a name nobody could reuse and a role nobody
                //     could browse (T-102).
                async function addRoleAutoBit(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ): Promise<{roleId: string; roleName: string; roleBit: number}> {
                    const result = await accessRoleAdd<{
                        role: {roleId: string; roleName: string; roleBit: number};
                    }>(
                        {
                            role: {
                                roleName: `MODEL-TEST-AUTO-BIT-${Date.now()}`,
                                description: 'allocated role bit',
                            },
                        },
                        $meta,
                    );
                    assert.ok(
                        Number.isInteger(result.role?.roleBit) && result.role.roleBit >= 0,
                        'a role created without a bit is given a real one',
                    );
                    const stored = await accessRoleGet<{role: {roleBit: number}}>(
                        {roleId: result.role.roleId},
                        $meta,
                    );
                    assert.equal(
                        Number(stored.role.roleBit),
                        Number(result.role.roleBit),
                        'the allocated bit is persisted on the role row',
                    );
                    return result.role;
                },

                // 2c. An explicit bit owned by another role is refused loudly
                //     (Admin holds bit 0) instead of being silently skipped.
                async function addRoleTakenBit(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    let failure = '';
                    try {
                        await accessRoleAdd(
                            {role: {roleName: `MODEL-TEST-TAKEN-${Date.now()}`, roleBit: 0}},
                            {...$meta, expect: ['role.bitTaken']},
                        );
                    } catch (error) {
                        failure = (error as {type?: string}).type ?? '';
                    }
                    assert.equal(failure, 'role.bitTaken', 'a taken role bit is refused');
                    return {failure};
                },

                // 2d. A bit never moves: it is the role's position in the `per`
                //     mask of already-minted tokens, so an edit that changes it is
                //     refused rather than silently re-pointing live permissions.
                async function editRoleBit(
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
                    let failure = '';
                    try {
                        await accessRoleEdit(
                            {role: {roleId: created.roleId, roleBit: 997}},
                            {...$meta, expect: ['role.bitImmutable']},
                        );
                    } catch (error) {
                        failure = (error as {type?: string}).type ?? '';
                    }
                    assert.equal(failure, 'role.bitImmutable', 'a role bit cannot be changed');
                    return created;
                },

                // 2e. The seed path (`meta/db/1-accessRoleMerge.yaml`) allocates a
                //     bit per role in file order, which is what lets a seed file
                //     list roles by name only — no hand-maintained bit table, and
                //     no way to collide with a role another realm seeded.
                async function mergeRoleList(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const suffix = Date.now();
                    const result = await accessRoleMerge<{
                        role: Array<{roleId: string; name: string; roleBit: number}>;
                    }>(
                        {
                            resourceType: 'access.role',
                            role: [
                                {name: `MODEL-TEST-SEED-A-${suffix}`, description: 'seed a'},
                                {name: `MODEL-TEST-SEED-B-${suffix}`, description: 'seed b'},
                            ],
                        },
                        $meta,
                    );
                    assert.equal(result.role.length, 2, 'the merge returns one entry per role');
                    assert.equal(
                        result.role[1].roleBit,
                        result.role[0].roleBit + 1,
                        'bits are allocated in file order',
                    );
                    return result.role;
                },

                // 3. Create a user with the role, read it back, edit it, list it.
                //    The list step looks the user up by the email minted here — the
                //    table grows with every run, so an unfiltered page would miss it.
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
                    const result = await accessUserAdd<{
                        user: {userId: string; emailAddress: string};
                    }>(
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
                    assert.ok(result.user?.emailAddress, 'user add returns the email');
                    return result.user;
                },

                async function getUserDetails(
                    assert: IAssert,
                    {
                        $meta,
                        addUser: user,
                    }: {
                        $meta: IMeta;
                        addUser: Promise<{userId: string; emailAddress: string}>;
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
                        getUserDetails: Promise<{userId: string; emailAddress: string}>;
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
                        editUser: Promise<{userId: string; emailAddress: string}>;
                    },
                ) {
                    const created = await user;
                    const result = await accessUserFind<
                        Array<{userId: string; emailAddress: string}>
                    >(
                        {
                            filterBy: {emailAddress: created.emailAddress},
                            paging: {pageNumber: 1, pageSize: 10},
                        },
                        $meta,
                    );
                    assert.ok(
                        result.some(item => item.userId === created.userId),
                        'user find returns the added user',
                    );
                    return created;
                },

                // 4. Session close — revokes a (fabricated) session id.  The target is
                //    not the caller's own, so the `access.session.close` action is
                //    required (granted on the meta below).
                async function closeSession(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await accessSessionClose<{success: boolean}>(
                        {sessionId: '00000000000000000000000000000000'},
                        {...$meta, auth: {...$meta.auth, actions: ['access.session.close']}},
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
                        addRoleAutoBit: autoRole,
                        mergeRoleList: seededRoles,
                    }: {
                        $meta: IMeta;
                        findUsers: Promise<{userId: string; emailAddress: string}>;
                        addRole: Promise<{roleId: string; roleName: string}>;
                        addRoleAutoBit: Promise<{roleId: string; roleName: string}>;
                        mergeRoleList: Promise<Array<{roleId: string; name: string}>>;
                    },
                ) {
                    const [createdUser, createdRole, allocatedRole, seeds] = await Promise.all([
                        user,
                        role,
                        autoRole,
                        seededRoles,
                    ]);
                    await accessUserRemove({userId: createdUser.userId}, $meta);
                    await accessRoleRemove({roleId: createdRole.roleId}, $meta);
                    await accessRoleRemove({roleId: allocatedRole.roleId}, $meta);
                    for (const seed of seeds) {
                        await accessRoleRemove({roleId: seed.roleId}, $meta);
                    }
                    assert.ok(true, 'cleanup removed the created entities');
                },
            ]),
    }),
);
