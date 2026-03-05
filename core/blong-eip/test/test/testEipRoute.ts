import {type IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(
    ({lib: {group}, handler: {eipMessageRoute}}) => ({
        testEipRoute: ({name = 'eip route'}: {name?: string}, $meta: IMeta) =>
            group(name)([
                async function routeToA(
                    assert: typeof Assert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const result = (await eipMessageRoute(
                        {destination: 'A', data: 'test'},
                        $meta,
                    )) as Record<string, unknown>;
                    assert.equal(result.pipeA, true, 'routed to handler A');
                    assert.equal(result.pipeB, undefined, 'not routed to handler B');
                },
                async function routeToB(
                    assert: typeof Assert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const result = (await eipMessageRoute(
                        {destination: 'B', data: 'test'},
                        $meta,
                    )) as Record<string, unknown>;
                    assert.equal(result.pipeB, true, 'routed to handler B');
                    assert.equal(result.pipeA, undefined, 'not routed to handler A');
                },
            ]),
    }),
);
