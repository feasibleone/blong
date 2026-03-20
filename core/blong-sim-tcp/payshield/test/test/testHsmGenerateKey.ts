import {handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

/**
 * Test for HSM generate key operation.
 *
 * Verifies the complete flow:
 * 1. Test handler calls hsmGenerateKey (orchestrator)
 * 2. Orchestrator calls generateKey lib (parameter transformation)
 * 3. Lib calls payshieldport.generateKey (TCP adapter)
 * 4. TCP adapter connects to payshieldSim (mock TCP server)
 * 5. Sim responds with mock key data
 * 6. Response is parsed and returned
 */
export default handler(({lib: {group}, handler: {hsmGenerateKey}}) => ({
    testHsmGenerateKey: ({name = 'hsm generate key'}, $meta) =>
        group(name)([
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
