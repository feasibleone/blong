import {type IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(
    ({lib: {group}, handler: {eipMessageClaim}}) => ({
        testEipClaim: ({name = 'eip claim'}: {name?: string}, $meta: IMeta) =>
            group(name)([
                async function claimCheck(
                    assert: typeof Assert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const result = (await eipMessageClaim(
                        {large: 'payload', sensitive: true},
                        $meta,
                    )) as Record<string, unknown>;
                    assert.equal(result.id, 'claim-id', 'claim ID returned');
                    assert.equal(result.payload, 'stored-data', 'stored payload retrieved');
                },
            ]),
    }),
);
