import {type IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(
    ({lib: {group}, handler: {eipMessageSplit}}) => ({
        testEipSplit: ({name = 'eip split'}: {name?: string}, _$meta: IMeta) =>
            group(name)([
                async function splitParallel(
                    assert: typeof Assert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const results = (await eipMessageSplit(
                        {items: ['a', 'b', 'c']},
                        $meta,
                    )) as Array<Record<string, unknown>>;
                    assert.equal(results.length, 3, 'three items processed');
                    assert.equal(results[0].processed, true, 'first item processed');
                    assert.equal(results[1].processed, true, 'second item processed');
                    assert.equal(results[2].processed, true, 'third item processed');
                },
                async function splitSequential(
                    assert: typeof Assert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const results = (await eipMessageSplit(
                        {items: ['x', 'y'], sequential: true},
                        $meta,
                    )) as Array<Record<string, unknown>>;
                    assert.equal(results.length, 2, 'two items processed');
                    assert.equal(results[0].processed, true, 'first item processed');
                    assert.equal(results[1].processed, true, 'second item processed');
                },
            ]),
    }),
);
