import { handler } from '../../../../types.js';

const DAY = 24 * 60 * 60 * 1000;
export default handler(({
    handler: {
        testLoginTokenCreate,
        subjectAge,
        subjectTime
    }
}) => ({
    testCodecMle: ({name = 'Message Level Encryption'}, $meta) => Object.defineProperty<unknown>([
        testLoginTokenCreate({}, $meta),
        async function mle(assert, {$meta}) {
            assert.deepStrictEqual(await subjectAge({birthDate: new Date(Date.now() - DAY)}, $meta), {age: 0}, 'Return age');
            assert.deepStrictEqual(await subjectAge({birthDate: new Date(Date.now() - 367 * DAY)}, $meta), {age: 1}, 'Return age');
            assert.equal((await subjectTime({area: 'Europe', location: 'Sofia'}, $meta)).abbreviation, 'EET', 'Return date and time');
        }
    ], 'name', {value: name})
}));
