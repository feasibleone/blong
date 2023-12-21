import { handler } from '@feasibleone/blong';

export default handler(({
    handler: {
        payshieldEcho
    }
}) => ({
    testTcpLoop: ({name = 'ports'}, $meta) => Object.defineProperty<unknown>([
        async function tcp(assert, {$meta}) {
            const result = await payshieldEcho<{data: string}>({
                message: 'ECHO',
                length: 4
            }, $meta);
            assert.equal(result.data, 'ECHO', 'Return data');
            return result;
        }
    ], 'name', {value: name})
}));
