import {IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(
    ({lib: {rename}, handler: {testLoginTokenCreate, testUserAdminLogin, subjectNumberSum}}) => ({
        testNumberSum: ({name = 'demo'}, $meta) =>
            rename(
                [
                    testLoginTokenCreate({}, $meta),
                    testUserAdminLogin({}, $meta),
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
                name
            ),
    })
);
