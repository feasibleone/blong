import {handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(({lib: {group}, handler: {testLoginTokenCreate, hsmGenerateKey}}) => ({
    testHsmGenerateKey: ({name = 'payshield'}, $meta) =>
        group(name)([
            testLoginTokenCreate({}, $meta),
            async function generateKey(assert: typeof Assert, {$meta}) {
                const result = await hsmGenerateKey<{key: string; kcv: string}>(
                    {
                        mode: '0',
                        keyType: 'ZMK',
                        keySchemeLmk: 'U',
                    },
                    $meta,
                );
                assert.ok(result.key, 'Return key');
                assert.ok(result.kcv, 'Return kcv');
                return result;
            },
        ]),
}));
