import {type IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(
    ({lib: {group}, handler: {eipMessageRecipient}}) => ({
        testEipRecipient: ({name = 'eip recipient'}: {name?: string}, $meta: IMeta) =>
            group(name)([
                async function recipientParallel(
                    assert: typeof Assert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const results = (await eipMessageRecipient(
                        {data: 'test'},
                        $meta,
                    )) as Array<Record<string, unknown>>;
                    assert.equal(results.length, 2, 'two results returned');
                    assert.equal(results[0].pipeA, true, 'first result from handler A');
                    assert.equal(results[1].pipeB, true, 'second result from handler B');
                },
                async function recipientSequential(
                    assert: typeof Assert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const results = (await eipMessageRecipient(
                        {sequential: true, data: 'test'},
                        $meta,
                    )) as Array<Record<string, unknown>>;
                    assert.equal(results.length, 2, 'two results returned');
                    assert.equal(results[0].pipeA, true, 'first result from handler A');
                    assert.equal(results[1].pipeB, true, 'second result from handler B');
                },
            ]),
    }),
);
