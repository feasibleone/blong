import {type IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(
    ({lib: {group}, handler: {eipMessageWrap}}) => ({
        testEipWrap: ({name = 'eip wrap'}: {name?: string}, _$meta: IMeta) =>
            group(name)([
                async function envelopeWrapper(
                    assert: typeof Assert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const result = (await eipMessageWrap(
                        {sensitive: 'data', amount: 100},
                        $meta,
                    )) as Record<string, unknown>;
                    assert.equal(result.processed, true, 'envelope processed');
                    const inner = result.item as Record<string, unknown>;
                    assert.ok(
                        typeof inner.payload === 'string',
                        'payload is a base64 string',
                    );
                    const decoded = JSON.parse(
                        Buffer.from(inner.payload as string, 'base64').toString(),
                    );
                    assert.equal(decoded.sensitive, 'data', 'original data recoverable from payload');
                },
            ]),
    }),
);
