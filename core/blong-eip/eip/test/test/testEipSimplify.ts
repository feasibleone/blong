import {type IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(
    ({lib: {group}, handler: {eipMessageSimplify}}) => ({
        testEipSimplify: ({name = 'eip simplify'}: {name?: string}, $meta: IMeta) =>
            group(name)([
                async function contentFilter(
                    assert: typeof Assert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const result = (await eipMessageSimplify(
                        {skip: 'sensitive-field', keep: 'important-data', amount: 42},
                        $meta,
                    )) as Record<string, unknown>;
                    assert.equal(result.processed, true, 'simplified message processed');
                    const inner = result.item as Record<string, unknown>;
                    assert.equal(inner.skip, undefined, 'skip field removed');
                    assert.equal(inner.keep, 'important-data', 'keep field preserved');
                    assert.equal(inner.amount, 42, 'amount field preserved');
                },
            ]),
    }),
);
