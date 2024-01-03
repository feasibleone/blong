import { handler } from '@feasibleone/blong';

export default handler(({
    handler: {
        testLoginTokenCreate,
        parkingTest
    }
}) => ({
    testDispatchLoop: ({name = 'ports'}, $meta) => Object.defineProperty<unknown>([
        testLoginTokenCreate({}, $meta),
        async function dispatch(assert, {$meta}) {
            assert.deepEqual(await parkingTest({zone: 'blue'}, $meta), {zone: 'blue', price: 2}, 'dispatch success');
            await assert.rejects(parkingTest({zone: 'red'}, {...$meta, expect: 'parking.invalidZone'}), {type: 'parking.invalidZone'}, 'dispatch error');
        }
    ], 'name', {value: name})
}));
