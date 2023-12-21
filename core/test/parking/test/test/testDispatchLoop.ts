import { handler } from '@feasibleone/blong';

export default handler(({
    handler: {
        parkingTest
    }
}) => ({
    testDispatchLoop: ({name = 'ports'}) => Object.defineProperty<unknown>([
        async function dispatch(assert, {$meta}) {
            assert.deepEqual(await parkingTest({zone: 'blue'}, $meta), {zone: 'blue', price: 2}, 'dispatch success');
            await assert.rejects(parkingTest({zone: 'red'}, {...$meta, expect: 'parking.invalidZone'}), {type: 'parking.invalidZone'}, 'dispatch error');
        }
    ], 'name', {value: name})
}));
