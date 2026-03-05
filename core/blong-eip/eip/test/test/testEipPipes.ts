import {type IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(
    ({lib: {group}, handler: {eipMessagePipes}}) => ({
        testEipPipes: ({name = 'eip pipes'}: {name?: string}, $meta: IMeta) =>
            group(name)([
                async function pipesAndFilters(
                    assert: typeof Assert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const result = (await eipMessagePipes(
                        {data: 'hello'},
                        $meta,
                    )) as Record<string, unknown>;
                    assert.equal(result.pipeA, true, 'passed through handler A');
                    assert.equal(result.pipeB, true, 'passed through handler B');
                    assert.equal(result.data, 'hello', 'original data preserved');
                },
            ]),
    }),
);
