import {handler, type IAssert, type IMeta} from '@feasibleone/blong';

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
        lib: {group, checkpoint, sortClientScopes},
        handler: {authClientAdd, authClientFind, authClientGet, authClientEdit, authClientRemove},
    }) => ({
        testKeycloakClientCrud: ({name = 'keycloak client CRUD'}: {name?: string}) =>
            // `id` — UUID assigned by Keycloak; `secret` — randomly generated per run;
            // `attributes` — contains `client.secret.creation.time` (a Unix timestamp).
            group(name, {mask: ['id', 'secret', 'attributes']})([
                // ── 1. Clean up leftover test client if present ────────────
                async function ensureClean(assert: IAssert, {$meta}: StepMeta) {
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
                    assert: IAssert,
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
                    assert: IAssert,
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
                    assert: IAssert,
                    {$meta, addClient}: StepMeta & {addClient: Promise<CreateResult>},
                ) {
                    // Snapshot captures clientId, enabled, protocol, and all other fields.
                    // Chain-level mask handles the Keycloak `id` UUID.
                    assert.snapshot();
                    return sortClientScopes(
                        await authClientGet(
                            {realm: testClient.realm, id: (await addClient).id},
                            $meta,
                        ),
                    ) as ClientResult & {id: string};
                },

                // ── 5. edit — update the client name ──────────────────────
                async function editClient(
                    assert: IAssert,
                    {$meta, addClient}: StepMeta & {addClient: Promise<CreateResult>},
                ) {
                    const {id} = await addClient;
                    await authClientEdit({realm: testClient.realm, id, ...updatedClient}, $meta);
                    assert.ok(true, 'edit client completed without error');
                    return {id};
                },

                // ── 6. verify edit — re-fetch to confirm the update ────────
                async function verifyEdit(
                    assert: IAssert,
                    {$meta, editClient}: StepMeta & {editClient: Promise<{id: string}>},
                ) {
                    // Snapshot captures updated name alongside all other fields.
                    assert.snapshot();
                    return sortClientScopes(
                        await authClientGet(
                            {realm: testClient.realm, id: (await editClient).id},
                            $meta,
                        ),
                    ) as ClientResult;
                },

                // Phase checkpoint: snapshot both read-back results together
                checkpoint('client-read-snapshots', 'getClient', 'verifyEdit'),

                // ── 7. remove — delete the test client ────────────────────
                async function removeClient(
                    assert: IAssert,
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
                    await authClientRemove(
                        {realm: testClient.realm, id: (await addClient).id},
                        $meta,
                    );
                    assert.ok(true, 'remove client completed without error');
                    return {removed: true};
                },
            ]),
    }),
);
