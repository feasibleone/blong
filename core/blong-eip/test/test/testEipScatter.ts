import {type IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(
    ({lib: {group}, handler: {eipMessageScatter}}) => ({
        testEipScatter: ({name = 'eip scatter'}: {name?: string}, $meta: IMeta) =>
            group(name)([
                async function scatter(
                    assert: typeof Assert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const results = (await eipMessageScatter(
                        {destinations: ['mockPipeA', 'mockPipeB', 'mockPipeC'], data: 'test'},
                        $meta,
                    )) as Array<Record<string, unknown>>;
                    assert.equal(results.length, 3, 'three results returned');
                    assert.equal(results[0].pipeA, true, 'first result from mockPipeA');
                    assert.equal(results[1].pipeB, true, 'second result from mockPipeB');
                    assert.equal(results[2].pipeC, true, 'third result from mockPipeC');
                },
            ]),
    }),
);
