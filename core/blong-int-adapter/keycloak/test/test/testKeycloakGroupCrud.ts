import {handler, type IMeta} from '@feasibleone/blong';
import type Assert from 'node:assert';

import {testGroup, updatedGroup} from '../fixtures/group.ts';

type GroupResult = {id?: string; name?: string; path?: string};
type CreateResult = {id: string};
type StepMeta = {$meta: IMeta};

/**
 * testKeycloakGroupCrud — integration test covering Keycloak group operations:
 * add, find, get, edit, members, remove.
 *
 * All groups are created in the pre-existing `blong-integration` realm.
 */
export default handler(
    ({
        lib: {group},
        handler: {
            authGroupAdd,
            authGroupFind,
            authGroupGet,
            authGroupEdit,
            authGroupMembers,
            authGroupRemove,
        },
    }) => ({
        testKeycloakGroupCrud: ({name = 'keycloak group CRUD'}: {name?: string}) =>
            group(name)([
                // ── 1. Clean up leftover test group if present ─────────────
                async function ensureClean(assert: typeof Assert, {$meta}: StepMeta) {
                    try {
                        const groups = (await authGroupFind(
                            {realm: testGroup.realm, search: testGroup.name},
                            $meta,
                        )) as GroupResult[];
                        for (const g of groups) {
                            if (g.id && g.name === testGroup.name) {
                                await authGroupRemove({realm: testGroup.realm, id: g.id}, $meta);
                            }
                        }
                    } catch {
                        // ignore
                    }
                    try {
                        const groups = (await authGroupFind(
                            {realm: testGroup.realm, search: updatedGroup.name},
                            $meta,
                        )) as GroupResult[];
                        for (const g of groups) {
                            if (g.id && g.name === updatedGroup.name) {
                                await authGroupRemove({realm: testGroup.realm, id: g.id}, $meta);
                            }
                        }
                    } catch {
                        // ignore
                    }
                    assert.ok(true, 'pre-test cleanup completed');
                    return {cleaned: true};
                },

                // ── 2. add — create the test group ────────────────────────
                async function addGroup(
                    assert: typeof Assert,
                    {$meta, ensureClean}: StepMeta & {ensureClean: Promise<unknown>},
                ) {
                    await ensureClean;
                    const result = await authGroupAdd({...testGroup}, $meta);
                    assert.ok(result, 'add group returned a result');
                    assert.ok((result as CreateResult).id, 'add group returned an id');
                    return result as CreateResult;
                },

                // ── 3. find — locate the group by name ────────────────────
                async function findGroups(
                    assert: typeof Assert,
                    {$meta, addGroup}: StepMeta & {addGroup: Promise<CreateResult>},
                ) {
                    await addGroup;
                    const result = await authGroupFind(
                        {realm: testGroup.realm, search: testGroup.name},
                        $meta,
                    );
                    assert.ok(Array.isArray(result), 'find returned an array');
                    assert.ok(
                        (result as GroupResult[]).length >= 1,
                        'find returned at least one group',
                    );
                    const found = (result as GroupResult[]).find(g => g.name === testGroup.name);
                    assert.ok(found, 'the created group is present in find results');
                    return result as GroupResult[];
                },

                // ── 4. get — fetch the group by id ────────────────────────
                async function getGroup(
                    assert: typeof Assert,
                    {$meta, addGroup}: StepMeta & {addGroup: Promise<CreateResult>},
                ) {
                    const {id} = await addGroup;
                    const result = await authGroupGet({realm: testGroup.realm, id}, $meta);
                    assert.ok(result, 'get group returned a result');
                    assert.strictEqual(
                        (result as GroupResult).name,
                        testGroup.name,
                        'get returned the correct group name',
                    );
                    return result as GroupResult & {id: string};
                },

                // ── 5. edit — rename the group ────────────────────────────
                async function editGroup(
                    assert: typeof Assert,
                    {$meta, addGroup}: StepMeta & {addGroup: Promise<CreateResult>},
                ) {
                    const {id} = await addGroup;
                    await authGroupEdit(
                        {realm: testGroup.realm, id, ...updatedGroup},
                        $meta,
                    );
                    assert.ok(true, 'edit group completed without error');
                    return {id};
                },

                // ── 6. verify edit — re-fetch to confirm the rename ────────
                async function verifyEdit(
                    assert: typeof Assert,
                    {$meta, editGroup}: StepMeta & {editGroup: Promise<{id: string}>},
                ) {
                    const {id} = await editGroup;
                    const result = await authGroupGet({realm: testGroup.realm, id}, $meta);
                    assert.ok(result, 'get after edit returned a result');
                    assert.strictEqual(
                        (result as GroupResult).name,
                        updatedGroup.name,
                        'group name was updated correctly',
                    );
                    return result as GroupResult;
                },

                // ── 7. members — list members of the group (should be empty)
                async function listMembers(
                    assert: typeof Assert,
                    {$meta, addGroup}: StepMeta & {addGroup: Promise<CreateResult>},
                ) {
                    const {id} = await addGroup;
                    const result = await authGroupMembers({realm: testGroup.realm, id}, $meta);
                    assert.ok(Array.isArray(result), 'members returned an array');
                    assert.strictEqual(
                        (result as unknown[]).length,
                        0,
                        'newly created group has no members',
                    );
                    return result;
                },

                // ── 8. remove — delete the test group ─────────────────────
                async function removeGroup(
                    assert: typeof Assert,
                    {
                        $meta,
                        verifyEdit,
                        findGroups,
                        listMembers,
                        addGroup,
                    }: StepMeta & {
                        verifyEdit: Promise<unknown>;
                        findGroups: Promise<unknown>;
                        listMembers: Promise<unknown>;
                        addGroup: Promise<CreateResult>;
                    },
                ) {
                    await verifyEdit;
                    await findGroups;
                    await listMembers;
                    const {id} = await addGroup;
                    await authGroupRemove({realm: testGroup.realm, id}, $meta);
                    assert.ok(true, 'remove group completed without error');
                    return {removed: true};
                },
            ]),
    }),
);
