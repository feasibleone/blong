import {handler, type IMeta} from '@feasibleone/blong';
import type Assert from 'node:assert';

import {testClient, updatedClient} from '../fixtures/client.ts';

type ClientResult = {
    id?: string;
    clientId?: string;
    name?: string;
    enabled?: boolean;
    protocol?: string;
};
type CreateResult = {id: string};
type StepMeta = {$meta: IMeta};

/**
 * testKeycloakClientCrud — integration test covering Keycloak client operations:
 * add, find, get, edit, remove.
 *
 * All clients are created in the pre-existing `blong-integration` realm.
 */
export default handler(
    ({
        lib: {group},
        handler: {
            authClientAdd,
            authClientFind,
            authClientGet,
            authClientEdit,
            authClientRemove,
        },
    }) => ({
        testKeycloakClientCrud: ({name = 'keycloak client CRUD'}: {name?: string}) =>
            group(name)([
                // ── 1. Clean up leftover test client if present ────────────
                async function ensureClean(assert: typeof Assert, {$meta}: StepMeta) {
                    try {
                        const clients = (await authClientFind(
                            {realm: testClient.realm, clientId: testClient.clientId},
                            $meta,
                        )) as ClientResult[];
                        for (const c of clients) {
                            if (c.id && c.clientId === testClient.clientId) {
                                await authClientRemove({realm: testClient.realm, id: c.id}, $meta);
                            }
                        }
                    } catch {
                        // ignore
                    }
                    assert.ok(true, 'pre-test cleanup completed');
                    return {cleaned: true};
                },

                // ── 2. add — create the test client ───────────────────────
                async function addClient(
                    assert: typeof Assert,
                    {$meta, ensureClean}: StepMeta & {ensureClean: Promise<unknown>},
                ) {
                    await ensureClean;
                    const result = await authClientAdd({...testClient}, $meta);
                    assert.ok(result, 'add client returned a result');
                    assert.ok((result as CreateResult).id, 'add client returned an id');
                    return result as CreateResult;
                },

                // ── 3. find — locate the client by clientId ───────────────
                async function findClients(
                    assert: typeof Assert,
                    {$meta, addClient}: StepMeta & {addClient: Promise<CreateResult>},
                ) {
                    await addClient;
                    const result = await authClientFind(
                        {realm: testClient.realm, clientId: testClient.clientId},
                        $meta,
                    );
                    assert.ok(Array.isArray(result), 'find returned an array');
                    assert.ok(
                        (result as ClientResult[]).length >= 1,
                        'find returned at least one client',
                    );
                    const found = (result as ClientResult[]).find(
                        c => c.clientId === testClient.clientId,
                    );
                    assert.ok(found, 'the created client is present in find results');
                    return result as ClientResult[];
                },

                // ── 4. get — fetch the client by id ───────────────────────
                async function getClient(
                    assert: typeof Assert,
                    {$meta, addClient}: StepMeta & {addClient: Promise<CreateResult>},
                ) {
                    const {id} = await addClient;
                    const result = await authClientGet({realm: testClient.realm, id}, $meta);
                    assert.ok(result, 'get client returned a result');
                    assert.strictEqual(
                        (result as ClientResult).clientId,
                        testClient.clientId,
                        'get returned the correct clientId',
                    );
                    assert.strictEqual(
                        (result as ClientResult).enabled,
                        testClient.enabled,
                        'get returned the correct enabled state',
                    );
                    return result as ClientResult & {id: string};
                },

                // ── 5. edit — update the client name ──────────────────────
                async function editClient(
                    assert: typeof Assert,
                    {$meta, addClient}: StepMeta & {addClient: Promise<CreateResult>},
                ) {
                    const {id} = await addClient;
                    await authClientEdit(
                        {realm: testClient.realm, id, ...updatedClient},
                        $meta,
                    );
                    assert.ok(true, 'edit client completed without error');
                    return {id};
                },

                // ── 6. verify edit — re-fetch to confirm the update ────────
                async function verifyEdit(
                    assert: typeof Assert,
                    {$meta, editClient}: StepMeta & {editClient: Promise<{id: string}>},
                ) {
                    const {id} = await editClient;
                    const result = await authClientGet({realm: testClient.realm, id}, $meta);
                    assert.ok(result, 'get after edit returned a result');
                    assert.strictEqual(
                        (result as ClientResult).name,
                        updatedClient.name,
                        'client name was updated correctly',
                    );
                    return result as ClientResult;
                },

                // ── 7. remove — delete the test client ────────────────────
                async function removeClient(
                    assert: typeof Assert,
                    {
                        $meta,
                        verifyEdit,
                        findClients,
                        getClient,
                        addClient,
                    }: StepMeta & {
                        verifyEdit: Promise<unknown>;
                        findClients: Promise<unknown>;
                        getClient: Promise<unknown>;
                        addClient: Promise<CreateResult>;
                    },
                ) {
                    await verifyEdit;
                    await findClients;
                    await getClient;
                    const {id} = await addClient;
                    await authClientRemove({realm: testClient.realm, id}, $meta);
                    assert.ok(true, 'remove client completed without error');
                    return {removed: true};
                },
            ]),
    }),
);
