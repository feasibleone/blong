import { handler } from '@feasibleone/blong';

export default handler(({
    handler: {
        testLoginTokenCreate,
        payshieldEcho
    }
}) => ({
    testTcpLoop: ({name = 'ports'}, $meta) => Object.defineProperty<unknown>([
        testLoginTokenCreate({}, $meta),
        async function tcp(assert, {$meta}) {
            const result = await payshieldEcho<{data: string}>({
                data: 'ECHO',
                length: 4
            }, $meta);
            assert.equal(result.data, 'ECHO', 'Return data');
        }
    ], 'name', {value: name})
}));
