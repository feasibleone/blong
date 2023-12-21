import { handler } from '@feasibleone/blong';

export default handler(({
    handler: {
        'hsm.generateKey': hsmGenerateKey
    }
}) => ({
    testHsmGenerateKey: ({name = 'payshield'}, $meta) => Object.defineProperty<unknown>([
        async function generateKey(assert, {$meta}) {
            const result = await hsmGenerateKey<{key: string, kcv: string}>({
                mode: '0',
                keyType: 'ZMK',
                keySchemeLmk: 'U'
            }, $meta);
            assert.ok(result.key, 'Return key');
            assert.ok(result.kcv, 'Return kcv');
            return result;
        }
    ], 'name', {value: name})
}));
