import {type IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(
    ({lib: {group}, handler: {eipMessageCompose}}) => ({
        testEipCompose: ({name = 'eip compose'}: {name?: string}, _$meta: IMeta) =>
            group(name)([
                async function compose(
                    assert: typeof Assert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const result = (await eipMessageCompose(
                        {part1: {value: 1}, part2: {value: 2}},
                        $meta,
                    )) as Record<string, unknown>;
                    assert.equal(result.pipeA, true, 'part1 processed by handler A');
                    assert.equal(result.pipeB, true, 'part2 processed by handler B');
                },
            ]),
    }),
);
