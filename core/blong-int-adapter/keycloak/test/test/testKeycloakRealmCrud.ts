import {handler, type IMeta} from '@feasibleone/blong';
import type Assert from 'node:assert';

import {testRealm, updatedRealm} from '../fixtures/realm.ts';

type RealmResult = {realm?: string; displayName?: string; enabled?: boolean};
type StepMeta = {$meta: IMeta};

/**
 * testKeycloakRealmCrud — integration test covering Keycloak realm operations:
 * find, add, get, edit, remove.
 *
 * Creates a dedicated `blong-test-realm`, verifies it, updates it, and removes it.
 * The `blong-integration` realm (created by the init job) is used only for listing.
 */
export default handler(
    ({
        lib: {group},
        handler: {authRealmFind, authRealmAdd, authRealmGet, authRealmEdit, authRealmRemove},
    }) => ({
        testKeycloakRealmCrud: ({name = 'keycloak realm CRUD'}: {name?: string}) =>
            group(name)([
                // ── 1. Clean up leftover test realm if present ─────────────
                async function ensureClean(assert: typeof Assert, {$meta}: StepMeta) {
                    try {
                        await authRealmRemove({realm: testRealm.realm}, $meta);
                    } catch {
                        // ignore – realm may not exist
                    }
                    assert.ok(true, 'pre-test cleanup completed');
                    return {cleaned: true};
                },

                // ── 2. find — list all realms (master should always be present)
                async function findRealms(
                    assert: typeof Assert,
                    {$meta, ensureClean}: StepMeta & {ensureClean: Promise<unknown>},
                ) {
                    await ensureClean;
                    const result = await authRealmFind({}, $meta);
                    assert.ok(Array.isArray(result), 'find returned an array');
                    assert.ok(
                        (result as RealmResult[]).length > 0,
                        'find returned at least one realm',
                    );
                    const master = (result as RealmResult[]).find(r => r.realm === 'master');
                    assert.ok(master, 'master realm is present');
                    return result as RealmResult[];
                },

                // ── 3. add — create the test realm ────────────────────────
                async function addRealm(
                    assert: typeof Assert,
                    {$meta, ensureClean}: StepMeta & {ensureClean: Promise<unknown>},
                ) {
                    await ensureClean;
                    const result = await authRealmAdd({...testRealm}, $meta);
                    assert.ok(result !== undefined, 'add realm returned a result');
                    return {realm: testRealm.realm};
                },

                // ── 4. get — fetch the newly created realm ─────────────────
                async function getRealm(
                    assert: typeof Assert,
                    {$meta, addRealm}: StepMeta & {addRealm: Promise<{realm: string}>},
                ) {
                    const {realm} = await addRealm;
                    const result = await authRealmGet({realm}, $meta);
                    assert.ok(result, 'get realm returned a result');
                    assert.strictEqual(
                        (result as RealmResult).realm,
                        testRealm.realm,
                        'get returned the correct realm name',
                    );
                    assert.strictEqual(
                        (result as RealmResult).displayName,
                        testRealm.displayName,
                        'get returned the correct displayName',
                    );
                    assert.strictEqual(
                        (result as RealmResult).enabled,
                        testRealm.enabled,
                        'get returned the correct enabled state',
                    );
                    return result as RealmResult;
                },

                // ── 5. edit — update the realm display name ────────────────
                async function editRealm(
                    assert: typeof Assert,
                    {$meta, getRealm}: StepMeta & {getRealm: Promise<RealmResult>},
                ) {
                    await getRealm;
                    await authRealmEdit(
                        {realm: testRealm.realm, ...updatedRealm},
                        $meta,
                    );
                    assert.ok(true, 'edit realm completed without error');
                    return {realm: testRealm.realm};
                },

                // ── 6. verify edit — re-fetch to confirm the update ────────
                async function verifyEdit(
                    assert: typeof Assert,
                    {$meta, editRealm}: StepMeta & {editRealm: Promise<{realm: string}>},
                ) {
                    const {realm} = await editRealm;
                    const result = await authRealmGet({realm}, $meta);
                    assert.ok(result, 'get after edit returned a result');
                    assert.strictEqual(
                        (result as RealmResult).displayName,
                        updatedRealm.displayName,
                        'displayName was updated correctly',
                    );
                    return result as RealmResult;
                },

                // ── 7. remove — delete the test realm ─────────────────────
                async function removeRealm(
                    assert: typeof Assert,
                    {
                        $meta,
                        verifyEdit,
                        findRealms,
                    }: StepMeta & {
                        verifyEdit: Promise<unknown>;
                        findRealms: Promise<unknown>;
                    },
                ) {
                    await verifyEdit;
                    await findRealms;
                    await authRealmRemove({realm: testRealm.realm}, $meta);
                    assert.ok(true, 'remove realm completed without error');
                    return {removed: true};
                },

                // ── 8. find — verify the test realm is gone ───────────────
                async function verifyRemoval(
                    assert: typeof Assert,
                    {$meta, removeRealm}: StepMeta & {removeRealm: Promise<unknown>},
                ) {
                    await removeRealm;
                    const result = await authRealmFind({}, $meta);
                    assert.ok(Array.isArray(result), 'find after removal returned an array');
                    const stillPresent = (result as RealmResult[]).find(
                        r => r.realm === testRealm.realm,
                    );
                    assert.ok(!stillPresent, 'test realm is no longer in the list');
                    return result as RealmResult[];
                },
            ]),
    }),
);
