import { handler } from '@feasibleone/blong';

export default handler(({
    handler: {
        testUserAdminLogin,
        subjectNumberSum
    }
}) => ({
    testNumberSum: ({name = 'demo'}, $meta) => Object.defineProperty([
        testUserAdminLogin({}, $meta),
        'Login admin user',
        async function sum(assert, {$meta}) {
            assert.equal(await subjectNumberSum([1000, 200, 30, 4], $meta), 1234, 'sum array');
            assert.equal(await subjectNumberSum([], $meta), 0, 'sum empty array');
            await assert.rejects(subjectNumberSum([-1], {...$meta, expect: 'subject.sum'}), {type: 'subject.sum'}, 'reject negative');
        }
    ], 'name', {value: name})
}));
