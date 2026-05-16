import {type IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(
    ({lib: {group}, handler: {eipMessageEnrich}}) => ({
        testEipEnrich: ({name = 'eip enrich'}: {name?: string}, _$meta: IMeta) =>
            group(name)([
                async function contentEnricher(
                    assert: typeof Assert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const result = (await eipMessageEnrich(
                        {original: 'data'},
                        $meta,
                    )) as Record<string, unknown>;
                    assert.equal(result.processed, true, 'enriched message processed');
                    const inner = result.item as Record<string, unknown>;
                    assert.equal(inner.enrichment, 'extra-data', 'enrichment data merged');
                    assert.equal(inner.original, 'data', 'original data preserved');
                },
            ]),
    }),
);
