import {handler, type IMeta} from '@feasibleone/blong/types';
import type Assert from 'node:assert';

const DAY = 24 * 60 * 60 * 1000;
export default handler(({lib: {group}, handler: {testLoginTokenCreate, subjectAge}}) => ({
    testCodecMle: ({name = 'Message Level Encryption'}: {name?: string}, $meta) =>
        group(name)([
            testLoginTokenCreate({}, $meta),
            async function mle(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                assert.deepStrictEqual(
                    await subjectAge({birthDate: new Date(Date.now() - DAY)}, $meta),
                    {age: 0},
                    'Return age',
                );
                assert.deepStrictEqual(
                    await subjectAge({birthDate: new Date(Date.now() - 367 * DAY)}, $meta),
                    {age: 1},
                    'Return age',
                );
            },
        ]),
}));
