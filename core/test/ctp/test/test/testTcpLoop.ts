import {IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(({lib: {rename}, handler: {testLoginTokenCreate, payshieldEcho}}) => ({
    testTcpLoop: ({name = 'ports'}, $meta) =>
        rename(
            [
                testLoginTokenCreate({}, $meta),
                async function tcp(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                    const result = await payshieldEcho<{data: string}>(
                        {
                            data: 'ECHO',
                            length: 4,
                        },
                        $meta
                    );
                    assert.equal(result.data, 'ECHO', 'Return data');
                },
            ],
            name
        ),
}));
