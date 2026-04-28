import {handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(({lib: {group}, handler: {secretsSecretPut, secretsSecretGet}}) => ({
    testVaultSecretPut: ({name = 'vault secret write/read round-trip'}, $meta) =>
        group(name)([
            async function writeSecret(assert: typeof Assert, {$meta}) {
                const secretData = {data: {blongTestKey: 'blong-test-value-' + Date.now()}};
                const result = await secretsSecretPut(
                    {path: 'secret/blong-test', ...secretData},
                    $meta,
                );
                assert.ok(result !== undefined, 'Write should return a result');
                return {path: 'secret/blong-test'};
            },
            async function readSecret(assert: typeof Assert, {$meta}, {path}: {path: string}) {
                const result = await secretsSecretGet({path}, $meta);
                assert.ok(result, 'Read should return a result');
                return result;
            },
        ]),
}));
