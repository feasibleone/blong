import {handler, type IMeta} from '@feasibleone/blong';
import type Assert from 'node:assert';

/**
 * testVaultMountList — integration test for the commander explore vocabulary of
 * `adapter.vault`:
 *   `secrets.mount.list` → enumerate mounted secret engines
 *   `secrets.secret.list` → list secrets at a path (existing operation)
 */
export default handler(
    ({lib: {group}, handler: {secretsMountList, secretsSecretList}}) => ({
        testVaultMountList: ({name = 'vault mount explore list'}: {name?: string}) =>
            group(name)([
                async function listMounts(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                    const result = await secretsMountList({}, $meta);
                    const items = (result as {items?: unknown[]}).items ?? [];
                    assert.ok(Array.isArray(items), 'mount.list should return items');
                    assert.ok(items.length > 0, 'should list at least one mount');
                    return result;
                },
                async function listSecrets(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                    const result = await secretsSecretList({path: 'secret'}, $meta);
                    assert.ok(result !== undefined, 'secret.list should return a result');
                    return result;
                },
            ]),
    }),
);
