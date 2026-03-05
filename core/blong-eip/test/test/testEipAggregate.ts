import {type IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(
    ({lib: {group}, handler: {eipMessageAggregate}}) => ({
        testEipAggregate: ({name = 'eip aggregate'}: {name?: string}, $meta: IMeta) =>
            group(name)([
                async function aggregateMessages(
                    assert: typeof Assert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const r1 = await eipMessageAggregate({order: 1, data: 'first'}, $meta);
                    assert.equal(r1, undefined, 'not yet aggregated after first message');
                    const r2 = await eipMessageAggregate({order: 2, data: 'second'}, $meta);
                    assert.equal(r2, undefined, 'not yet aggregated after second message');
                    const r3 = (await eipMessageAggregate(
                        {order: 3, data: 'third'},
                        $meta,
                    )) as Record<string, unknown>;
                    assert.ok(r3, 'aggregated after third message');
                    assert.equal(r3.id, 'claim-id', 'batch stored via mockDataSave');
                },
            ]),
    }),
);
