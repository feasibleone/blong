import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/**
 * The 16 bytes of a UUID as hex.
 *
 * Three forms meet in this test: the model result serializes a binary column as
 * base64 (see `accessModel.ts`), `access.triple.merge` takes hex (it calls
 * `uuidBuf`, which strips dashes and parses hex), and `access.permission.list`
 * takes the dashed UUID of the stored bytes (the contract `accessSessionVerify`
 * documents).  Normalising here keeps the test about the paths rather than about
 * the transport's choice of encoding.
 */
function hexId(uuid: string): string {
    const bare = uuid.replace(/-/g, '');
    const hex = /^[0-9a-f]{32}$/i.test(bare) ? bare : Buffer.from(uuid, 'base64').toString('hex');
    if (!/^[0-9a-f]{32}$/i.test(hex)) {
        throw new Error(`not a 16-byte uuid: ${JSON.stringify(uuid)}`);
    }
    return hex.toLowerCase();
}

/** The dashed form of the same bytes. */
function dashed(uuid: string): string {
    const hex = hexId(uuid);
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20),
    ].join('-');
}

/**
 * server/test/test/testPathLagFlow.ts — a caller's permissions when the paths lag.
 *
 * `access.permission.list` resolves the caller's role bits and actions out of the
 * materialized `core_path`, which is what the login realm mints into the token and
 * the gateway then authorizes against. The paths are rebuilt from the graph, and a
 * writer is allowed to leave them behind: `core.triple.merge` counts the write in a
 * durable generation instead of rebuilding per merge while the seed phase owns the
 * rebuild (see `core/blong-gogo/src/adapter/server/pathRefresh.ts`).
 *
 * What that buys is that the update is never *lost*: a request may be a millisecond
 * behind a write, but never behind a write that no rebuild will ever cover. That is
 * the contract this test pins, and it is the one T-174 turned into a failure — the
 * framework realm's digest page was refused `blong.flow.find` because an edge
 * granted since startup was missing from the paths *and* no rebuild was due.
 *
 * The lag is produced the way a writer produces it: a role is granted a capability
 * *without* a rebuild, and the read is then the materialized answer, which does not
 * carry it yet — a stale read is the design, not the bug. The same edge is merged
 * again *with* a rebuild, which is what the seed's drain and every non-deferred
 * writer do, and the grant has to be there afterwards. Removing the user then has
 * to leave the read empty, so the last assertions cannot pass on a graph that no
 * longer grants anything.
 *
 * Registered as the `test.path.lag.flow` group (`integration.watch.test` in
 * `index.ts`).
 */
export default handler(
    ({
        lib: {group},
        handler: {
            accessRoleAdd,
            accessRoleRemove,
            accessUserAdd,
            accessUserRemove,
            accessPermissionList,
            // The graph writers live in the shared `db` group (the same one the
            // realm's own db handlers reach with this prefix), not in the access
            // realm: a bare name would be dispatched to a namespace that does not
            // exist and answer 404.
            //
            // Deliberately NOT `super.coreResourceEnsure`: these handlers sit on the
            // test layer's own `testDispatch` port, not on `srv.db`, and `super` only
            // reaches groups attached before the caller *on its own port*. A realm's
            // db handler can delegate to core; a test handler declares it (see the
            // library-realms rationale).
            'db/coreResourceEnsure': coreResourceEnsure,
            'db/coreTripleMerge': coreTripleMerge,
        },
    }) => ({
        testPathLagFlow: ({name = 'path lag flow'}: {name?: string} = {}) =>
            group(name)([
                // 1. A role of this run's own, with no bit: the allocator gives it
                //    one (see `accessRoleEnsure`), so nothing here can collide with
                //    the six seeded roles or with a pinned bit another spec holds.
                async function addRole(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ): Promise<{roleId: string; roleName: string}> {
                    const result = await accessRoleAdd<{
                        role: {roleId: string; roleName: string};
                    }>(
                        {
                            role: {
                                roleName: `PATH-LAG-ROLE-${Date.now()}`,
                                description: 'path lag test role',
                            },
                        },
                        $meta,
                    );
                    assert.ok(result.role?.roleId, 'role add succeeds');
                    return result.role;
                },

                // 2. A user in that role, added the way the New form adds one. This
                //    path *does* rebuild, so the user→role edge is in the paths and
                //    the lag created next is the only thing they are missing.
                async function addUser(
                    assert: IAssert,
                    {
                        $meta,
                        addRole: role,
                    }: {$meta: IMeta; addRole: Promise<{roleId: string; roleName: string}>},
                ): Promise<{userId: string; roleId: string}> {
                    const created = await role;
                    const result = await accessUserAdd<{user: {userId: string}}>(
                        {
                            user: {
                                emailAddress: `path-lag-${Date.now()}@example.com`,
                                isActive: true,
                            },
                            role: [{roleId: created.roleId}],
                        },
                        $meta,
                    );
                    assert.ok(result.user?.userId, 'user add succeeds');
                    return {userId: result.user.userId, roleId: created.roleId};
                },

                // 3. The lag: the role is granted `blongRealmRead`, the capability
                //    the seed declares for the framework realm's reads, and the merge
                //    is told not to rebuild. The edge is in `core_triple` and in no
                //    `core_path` row, which is what a caller saw as "method
                //    blong.flow.find not allowed".
                async function lagCapability(
                    assert: IAssert,
                    {
                        $meta,
                        addUser: user,
                    }: {$meta: IMeta; addUser: Promise<{userId: string; roleId: string}>},
                ): Promise<{userId: string; roleId: string}> {
                    const created = await user;
                    const {resourceId: capabilityId} = await coreResourceEnsure<{
                        resourceId: string;
                    }>(
                        {
                            name: 'blongRealmRead',
                            typeAlias: 'access.capability',
                            table: 'access_capability',
                            keyName: 'capabilityId',
                        },
                        $meta,
                    );
                    assert.ok(capabilityId, 'the seeded blongRealmRead capability is found');
                    await coreTripleMerge(
                        {
                            triples: [
                                {
                                    subjectId: hexId(created.roleId),
                                    predicateName: 'hasCapability',
                                    objectId: capabilityId,
                                },
                            ],
                            refreshPath: false,
                        },
                        $meta,
                    );
                    return created;
                },

                // 4. The read while the paths lag.  It is the materialized answer —
                //    deliberately, because a request is allowed to be a millisecond
                //    behind a write.  What is not allowed is never catching up, which
                //    is the step after this one.  The role the user legitimately holds
                //    has to be there meanwhile, because that edge was built by the
                //    user add, not by the counted merge.
                async function readWhileLagging(
                    assert: IAssert,
                    {
                        $meta,
                        lagCapability: created,
                    }: {$meta: IMeta; lagCapability: Promise<{userId: string; roleId: string}>},
                ): Promise<{userId: string; roleId: string}> {
                    const {userId, roleId} = await created;
                    const result = await accessPermissionList<{
                        roleBits: number[];
                        actions: string[];
                    }>({userId: dashed(userId)}, $meta);
                    assert.ok(
                        result.roleBits.length > 0,
                        'the role the user holds is resolved to a bit',
                    );
                    assert.equal(
                        result.actions.includes('blong.flow.find'),
                        false,
                        'the grant the graph holds is not in the paths yet, and the read says so',
                    );
                    return {userId, roleId};
                },

                // 5. The same edge merged *with* a rebuild — the seed's drain at the
                //    end of a batch, and what a writer does when it is not deferring.
                //    The write was counted, so this rebuild covers it, and the grant is
                //    in the paths from here on: a little later, never lost.
                async function readAfterRebuild(
                    assert: IAssert,
                    {
                        $meta,
                        readWhileLagging: previous,
                    }: {
                        $meta: IMeta;
                        readWhileLagging: Promise<{userId: string; roleId: string}>;
                    },
                ): Promise<{userId: string; roleId: string}> {
                    const {userId, roleId} = await previous;
                    const {resourceId: capabilityId} = await coreResourceEnsure<{
                        resourceId: string;
                    }>(
                        {
                            name: 'blongRealmRead',
                            typeAlias: 'access.capability',
                            table: 'access_capability',
                            keyName: 'capabilityId',
                        },
                        $meta,
                    );
                    await coreTripleMerge(
                        {
                            triples: [
                                {
                                    subjectId: hexId(roleId),
                                    predicateName: 'hasCapability',
                                    objectId: capabilityId,
                                },
                            ],
                            refreshPath: true,
                        },
                        $meta,
                    );
                    const result = await accessPermissionList<{actions: string[]}>(
                        {userId: dashed(userId)},
                        $meta,
                    );
                    assert.ok(
                        result.actions.includes('blong.flow.find'),
                        'the counted write reached the paths, so it was never lost',
                    );
                    return {userId, roleId};
                },

                // 6. Clean up: the user first (its own edge to the role), then the
                //    role (its edge to the capability) — each removal rebuilds. With
                //    the user gone the read is empty, so the assertions above cannot
                //    pass on a graph that grants nothing.
                async function cleanup(
                    assert: IAssert,
                    {
                        $meta,
                        readAfterRebuild: created,
                    }: {$meta: IMeta; readAfterRebuild: Promise<{userId: string; roleId: string}>},
                ) {
                    const {userId, roleId} = await created;
                    await accessUserRemove({userId}, $meta);
                    await accessRoleRemove({roleId}, $meta);
                    const result = await accessPermissionList<{
                        roleBits: number[];
                        actions: string[];
                    }>({userId: dashed(userId)}, $meta);
                    assert.equal(
                        result.roleBits.length,
                        0,
                        'a removed user resolves to no role bits',
                    );
                    assert.equal(result.actions.length, 0, 'and to no actions');
                },
            ]),
    }),
);
