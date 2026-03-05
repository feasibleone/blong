import {type IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(
    ({lib: {group}, handler: {eipMessageReturn}}) => ({
        testEipReturn: ({name = 'eip return'}: {name?: string}, $meta: IMeta) =>
            group(name)([
                async function requestReply(
                    assert: typeof Assert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const result = await eipMessageReturn({result: 42}, $meta);
                    assert.equal(result, 42, 'returns the given result');
                },
            ]),
    }),
);
