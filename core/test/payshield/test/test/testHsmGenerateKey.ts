import {IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(
    ({lib: {rename}, handler: {testLoginTokenCreate, 'hsm.generateKey': hsmGenerateKey}}) => ({
        testHsmGenerateKey: ({name = 'payshield'}, $meta) =>
            rename(
                [
                    testLoginTokenCreate({}, $meta),
                    async function generateKey(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                        const result = await hsmGenerateKey<{key: string; kcv: string}>(
                            {
                                mode: '0',
                                keyType: 'ZMK',
                                keySchemeLmk: 'U',
                            },
                            $meta
                        );
                        assert.ok(result.key, 'Return key');
                        assert.ok(result.kcv, 'Return kcv');
                        return result;
                    },
                ],
                name
            ),
    })
);
