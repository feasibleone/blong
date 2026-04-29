import {handler, type IMeta} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(({lib: {group}, handler: {secretsSecretPut, secretsSecretGet}}) => ({
    testVaultSecretPut: ({name = 'vault secret write/read round-trip'}: {name?: string}) =>
        group(name)([
            async function writeSecret(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                const secretData = {data: {blongTestKey: 'blong-test-value-' + Date.now()}};
                const result = await secretsSecretPut(
                    {path: 'secret/blong-test', ...secretData},
                    $meta,
                );
                assert.ok(result !== undefined, 'Write should return a result');
                return {path: 'secret/blong-test'};
            },
            async function readSecret(
                assert: typeof Assert,
                {$meta, writeSecret}: {$meta: IMeta; writeSecret: Promise<{path: string}>},
            ) {
                const {path} = await writeSecret;
                const result = await secretsSecretGet({path}, $meta);
                assert.ok(result, 'Read should return a result');
                return result;
            },
        ]),
}));
