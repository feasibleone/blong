import {handler, type IMeta} from '@feasibleone/blong';
import type Assert from 'node:assert';

import {SECRET_PREFIX, secrets, updatedSecret} from '../fixtures/secret.ts';

type SecretData = Record<string, unknown>;
type ListResult = {keys?: string[]};
type StepMeta = {$meta: IMeta};

/**
 * testVaultSecretCrud — integration test covering all Vault adapter operations:
 * put (write), get (read), list, update, delete.
 *
 * Steps run in a sequential dependency chain.
 * Fixture data from `fixtures/secret.ts` is used for all writes.
 * The Vault CI instance uses KV v1 with token auth (root token).
 */
export default handler(
    ({
        lib: {group},
        handler: {secretsSecretPut, secretsSecretGet, secretsSecretList, secretsSecretRemove},
    }) => ({
        testVaultSecretCrud: ({name = 'vault secret CRUD'}: {name?: string}) =>
            group(name)([
                // ── 1. Wipe any leftover secrets from previous runs ────────
                async function cleanSecrets(assert: typeof Assert, {$meta}: StepMeta) {
                    for (const secret of secrets) {
                        try {
                            await secretsSecretRemove({path: secret.path}, $meta);
                        } catch {
                            // ignore – secret may not exist
                        }
                    }
                    assert.ok(true, 'cleanup completed');
                    return {cleaned: true};
                },

                // ── 2. put — write the first secret ───────────────────────
                async function writeAlpha(
                    assert: typeof Assert,
                    {$meta, cleanSecrets}: StepMeta & {cleanSecrets: Promise<unknown>},
                ) {
                    await cleanSecrets;
                    const secret = secrets[0];
                    const result = await secretsSecretPut(
                        {path: secret.path, data: {...secret.data}},
                        $meta,
                    );
                    assert.ok(result !== undefined, 'put alpha returned a result');
                    return {path: secret.path};
                },

                // ── 3. get — read back alpha and verify data ───────────────
                async function readAlpha(
                    assert: typeof Assert,
                    {$meta, writeAlpha}: StepMeta & {writeAlpha: Promise<{path: string}>},
                ) {
                    const {path} = await writeAlpha;
                    const result = await secretsSecretGet({path}, $meta);
                    assert.ok(result, 'get alpha returned a result');
                    assert.strictEqual(
                        (result as SecretData).blongKey,
                        secrets[0].data.blongKey,
                        'get returned the correct blongKey value',
                    );
                    assert.strictEqual(
                        (result as SecretData).blongSource,
                        secrets[0].data.blongSource,
                        'get returned the correct blongSource value',
                    );
                    return result as SecretData;
                },

                // ── 4. put — write the second secret ──────────────────────
                async function writeBeta(
                    assert: typeof Assert,
                    {$meta, cleanSecrets}: StepMeta & {cleanSecrets: Promise<unknown>},
                ) {
                    await cleanSecrets;
                    const secret = secrets[1];
                    const result = await secretsSecretPut(
                        {path: secret.path, data: {...secret.data}},
                        $meta,
                    );
                    assert.ok(result !== undefined, 'put beta returned a result');
                    return {path: secret.path};
                },

                // ── 5. list — list secrets at the test prefix ──────────────
                async function listSecrets(
                    assert: typeof Assert,
                    {
                        $meta,
                        writeAlpha,
                        writeBeta,
                    }: StepMeta & {
                        writeAlpha: Promise<unknown>;
                        writeBeta: Promise<unknown>;
                    },
                ) {
                    await writeAlpha;
                    await writeBeta;
                    const listPath = SECRET_PREFIX.replace(/\/$/, '');
                    const result = await secretsSecretList({path: listPath}, $meta);
                    assert.ok(result, 'list returned a result');
                    assert.ok(
                        Array.isArray((result as ListResult).keys),
                        'list returned a keys array',
                    );
                    assert.ok(
                        ((result as ListResult).keys?.length ?? 0) >= 2,
                        'list contains at least the two written secrets',
                    );
                    return result as ListResult;
                },

                // ── 6. put — overwrite alpha with updated data ─────────────
                async function updateAlpha(
                    assert: typeof Assert,
                    {$meta, readAlpha}: StepMeta & {readAlpha: Promise<unknown>},
                ) {
                    await readAlpha;
                    const result = await secretsSecretPut(
                        {path: secrets[0].path, data: {...updatedSecret.data}},
                        $meta,
                    );
                    assert.ok(result !== undefined, 'update alpha returned a result');
                    return {path: secrets[0].path};
                },

                // ── 7. get — verify the update took effect ─────────────────
                async function verifyUpdate(
                    assert: typeof Assert,
                    {$meta, updateAlpha}: StepMeta & {updateAlpha: Promise<{path: string}>},
                ) {
                    const {path} = await updateAlpha;
                    const result = await secretsSecretGet({path}, $meta);
                    assert.ok(result, 'get after update returned a result');
                    assert.strictEqual(
                        (result as SecretData).blongKey,
                        updatedSecret.data.blongKey,
                        'get returned the updated blongKey value',
                    );
                    assert.strictEqual(
                        (result as SecretData).blongSource,
                        updatedSecret.data.blongSource,
                        'get returned the updated blongSource value',
                    );
                    return result as SecretData;
                },

                // ── 8. remove — delete alpha ───────────────────────────────
                async function deleteAlpha(
                    assert: typeof Assert,
                    {
                        $meta,
                        verifyUpdate,
                        listSecrets,
                    }: StepMeta & {
                        verifyUpdate: Promise<unknown>;
                        listSecrets: Promise<unknown>;
                    },
                ) {
                    await verifyUpdate;
                    await listSecrets;
                    await secretsSecretRemove({path: secrets[0].path}, $meta);
                    assert.ok(true, 'remove alpha completed without error');
                    return {deleted: 'alpha'};
                },

                // ── 9. remove — delete beta ────────────────────────────────
                async function deleteBeta(
                    assert: typeof Assert,
                    {$meta, deleteAlpha}: StepMeta & {deleteAlpha: Promise<unknown>},
                ) {
                    await deleteAlpha;
                    await secretsSecretRemove({path: secrets[1].path}, $meta);
                    assert.ok(true, 'remove beta completed without error');
                    return {deleted: 'beta'};
                },

                // ── 10. list — verify both secrets are removed ─────────────
                async function verifyDeletion(
                    assert: typeof Assert,
                    {$meta, deleteBeta}: StepMeta & {deleteBeta: Promise<unknown>},
                ) {
                    await deleteBeta;
                    const listPath = SECRET_PREFIX.replace(/\/$/, '');
                    const result = await secretsSecretList({path: listPath}, $meta);
                    assert.ok(result, 'list after deletion returned a result');
                    const keys = (result as ListResult).keys ?? [];
                    assert.strictEqual(
                        keys.length,
                        0,
                        'no blong test secrets remain after deletion',
                    );
                    return result;
                },
            ]),
    }),
);
