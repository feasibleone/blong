import {type IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(({lib: {group}, handler: {testLoginTokenCreate, parkingTest}}) => ({
    testDispatchLoop: ({name = 'ports'}, $meta) =>
        group(name)([
            testLoginTokenCreate({}, $meta),
            async function dispatch(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                assert.deepEqual(
                    await parkingTest({zone: 'blue'}, $meta),
                    {zone: 'blue', price: 2},
                    'dispatch success',
                );
                // Expected errors: exact type match
                await assert.rejects(
                    parkingTest(
                        {zone: 'red'},
                        {...$meta, expect: 'parking.invalidZone'},
                    ) as Promise<unknown>,
                    {type: 'parking.invalidZone'},
                    'dispatch error — exact expect',
                );
                // Expected errors: array of types
                await assert.rejects(
                    parkingTest(
                        {zone: 'red'},
                        {...$meta, expect: ['parking.invalidZone', 'parking.rateLimit']},
                    ) as Promise<unknown>,
                    {type: 'parking.invalidZone'},
                    'dispatch error — array expect',
                );
                // Expected errors: wildcard prefix
                await assert.rejects(
                    parkingTest(
                        {zone: 'red'},
                        {...$meta, expect: 'parking.*'},
                    ) as Promise<unknown>,
                    {type: 'parking.invalidZone'},
                    'dispatch error — wildcard expect',
                );
            },
        ]),
}));
