import {type IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(
    ({lib: {group}, handler: {eipMessageFilter}}) => ({
        testEipFilter: ({name = 'eip filter'}: {name?: string}, $meta: IMeta) =>
            group(name)([
                async function filterPasses(
                    assert: typeof Assert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const result = (await eipMessageFilter(
                        {condition: true, data: 'test'},
                        $meta,
                    )) as Record<string, unknown>;
                    assert.equal(result.pipeA, true, 'message passed when condition is true');
                },
                async function filterBlocks(
                    assert: typeof Assert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const result = await eipMessageFilter(
                        {condition: false, data: 'test'},
                        $meta,
                    );
                    assert.equal(result, undefined, 'message blocked when condition is false');
                },
            ]),
    }),
);
