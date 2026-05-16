import {type IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(
    ({lib: {group}, handler: {eipMessageNormalize}}) => ({
        testEipNormalize: ({name = 'eip normalize'}: {name?: string}, _$meta: IMeta) =>
            group(name)([
                async function normalizeUppercase(
                    assert: typeof Assert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const result = (await eipMessageNormalize(
                        {format: 'uppercase', value: 'hello world'},
                        $meta,
                    )) as Record<string, unknown>;
                    assert.equal(result.processed, true, 'normalized message processed');
                    assert.equal(
                        (result.item as Record<string, unknown>).value,
                        'HELLO WORLD',
                        'value uppercased',
                    );
                },
                async function normalizeLowercase(
                    assert: typeof Assert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const result = (await eipMessageNormalize(
                        {format: 'lowercase', value: 'HELLO WORLD'},
                        $meta,
                    )) as Record<string, unknown>;
                    assert.equal(
                        (result.item as Record<string, unknown>).value,
                        'hello world',
                        'value lowercased',
                    );
                },
                async function normalizeTrim(
                    assert: typeof Assert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const result = (await eipMessageNormalize(
                        {format: 'trim', value: '  spaced  '},
                        $meta,
                    )) as Record<string, unknown>;
                    assert.equal(
                        (result.item as Record<string, unknown>).value,
                        'spaced',
                        'value trimmed',
                    );
                },
            ]),
    }),
);
