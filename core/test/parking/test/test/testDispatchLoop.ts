import {IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(({lib: {rename}, handler: {testLoginTokenCreate, parkingTest}}) => ({
    testDispatchLoop: ({name = 'ports'}, $meta) =>
        rename(
            [
                testLoginTokenCreate({}, $meta),
                async function dispatch(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                    assert.deepEqual(
                        await parkingTest({zone: 'blue'}, $meta),
                        {zone: 'blue', price: 2},
                        'dispatch success'
                    );
                    await assert.rejects(
                        parkingTest(
                            {zone: 'red'},
                            {...$meta, expect: 'parking.invalidZone'}
                        ) as Promise<unknown>,
                        {type: 'parking.invalidZone'},
                        'dispatch error'
                    );
                },
            ],
            name
        ),
}));
