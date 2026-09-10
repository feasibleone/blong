import {type IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(({lib: {group}, handler: {testLoginTokenCreate, payshieldEcho}}) => ({
    testTcpLoop: ({name = 'adapters'}: {name?: string}, $meta: IMeta) =>
        group(name)([
            testLoginTokenCreate({}, $meta),
            async function tcp(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                const result = await payshieldEcho<{data: string}>(
                    {
                        data: 'ECHO',
                        length: 4,
                    },
                    $meta,
                );
                assert.equal(result.data, 'ECHO', 'Return data');
            },
        ]),
}));
