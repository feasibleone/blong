import {handler, type IMeta} from '@feasibleone/blong';
import type Assert from 'node:assert';

const DAY = 24 * 60 * 60 * 1000;
export default handler(
    ({lib: {rename}, handler: {testLoginTokenCreate, subjectAge, subjectTime}}) => ({
        testCodecMle: ({name = 'Message Level Encryption'}, $meta) =>
            rename(
                [
                    testLoginTokenCreate({}, $meta),
                    async function mle(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                        assert.deepStrictEqual(
                            await subjectAge({birthDate: new Date(Date.now() - DAY)}, $meta),
                            {age: 0},
                            'Return age'
                        );
                        assert.deepStrictEqual(
                            await subjectAge({birthDate: new Date(Date.now() - 367 * DAY)}, $meta),
                            {age: 1},
                            'Return age'
                        );
                        assert.match(
                            (
                                (await subjectTime({area: 'Europe', location: 'Sofia'}, $meta)) as {
                                    abbreviation: string;
                                }
                            ).abbreviation,
                            /^EEST|EET|UTC$/,
                            'Return date and time'
                        );
                    },
                ],
                name
            ),
    })
);
