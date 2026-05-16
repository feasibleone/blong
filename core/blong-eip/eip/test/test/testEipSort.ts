import {type IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(
    ({lib: {group}, handler: {eipMessageSort}}) => ({
        testEipSort: ({name = 'eip sort'}: {name?: string}, _$meta: IMeta) =>
            group(name)([
                async function resequencer(
                    assert: typeof Assert,
                    {$meta}: {$meta: IMeta},
                ) {
                    // Send out-of-order messages; third call should trigger sorted processing
                    const r1 = await eipMessageSort({order: 3, data: 'third'}, $meta);
                    assert.equal(r1, undefined, 'not yet processed after first message');
                    const r2 = await eipMessageSort({order: 1, data: 'first'}, $meta);
                    assert.equal(r2, undefined, 'not yet processed after second message');
                    const r3 = (await eipMessageSort(
                        {order: 2, data: 'second'},
                        $meta,
                    )) as Array<Record<string, unknown>>;
                    assert.ok(Array.isArray(r3), 'returns array of results after batch');
                    assert.equal(r3.length, 3, 'all three items processed');
                    // Items should be processed in sorted order
                    assert.equal((r3[0].item as Record<string, unknown>).order, 1, 'first item has order 1');
                    assert.equal((r3[1].item as Record<string, unknown>).order, 2, 'second item has order 2');
                    assert.equal((r3[2].item as Record<string, unknown>).order, 3, 'third item has order 3');
                },
            ]),
    }),
);
