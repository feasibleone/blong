import {type IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(
    ({lib: {group}, handler: {eipMessageDynamic}}) => ({
        testEipDynamic: ({name = 'eip dynamic'}: {name?: string}, $meta: IMeta) =>
            group(name)([
                async function dynamicToA(
                    assert: typeof Assert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const result = (await eipMessageDynamic(
                        {destination: 'mockPipeA', data: 'test'},
                        $meta,
                    )) as Record<string, unknown>;
                    assert.equal(result.pipeA, true, 'dynamically routed to mockPipeA');
                },
                async function dynamicToB(
                    assert: typeof Assert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const result = (await eipMessageDynamic(
                        {destination: 'mockPipeB', data: 'test'},
                        $meta,
                    )) as Record<string, unknown>;
                    assert.equal(result.pipeB, true, 'dynamically routed to mockPipeB');
                },
            ]),
    }),
);
