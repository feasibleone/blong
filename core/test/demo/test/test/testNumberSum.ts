import {IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(
    ({handler: {testLoginTokenCreate, testUserAdminLogin, subjectNumberSum}}) => ({
        testNumberSum: ({name = 'demo'}, $meta) =>
            Object.defineProperty(
                [
                    testLoginTokenCreate({}, $meta),
                    testUserAdminLogin({}, $meta),
                    'Login admin user',
                    async function sum(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                        assert.equal(
                            await subjectNumberSum([1000, 200, 30, 4], $meta),
                            1234,
                            'sum array'
                        );
                        assert.equal(await subjectNumberSum([], $meta), 0, 'sum empty array');
                        await assert.rejects(
                            subjectNumberSum([-1], {
                                ...$meta,
                                expect: 'subjectSum',
                            }) as Promise<unknown>,
                            {type: 'subjectSum'},
                            'reject negative'
                        );
                    },
                ],
                'name',
                {value: name}
            ),
    })
);
