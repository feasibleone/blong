import { handler } from '../../../../types.js';

const DAY = 24 * 60 * 60 * 1000;
export default handler(({
    handler: {
        loginTokenCreate,
        subjectAge,
        subjectTime
    }
}) => ({
    testCodecMle: ({name = 'Message Level Encryption'}) => Object.defineProperty<unknown>([
        function login(assert, {$meta}) {
            return loginTokenCreate({
                username: 'test',
                password: 'test'
            }, $meta);
        },
        async function mle(assert, {$meta}) {
            assert.deepStrictEqual(await subjectAge({birthDate: new Date(Date.now() - DAY)}, $meta), {age: 0}, 'Return age');
            assert.deepStrictEqual(await subjectAge({birthDate: new Date(Date.now() - 367 * DAY)}, $meta), {age: 1}, 'Return age');
            assert.equal((await subjectTime({area: 'Europe', location: 'Sofia'}, $meta)).abbreviation, 'EET', 'Return date and time');
        }
    ], 'name', {value: name})
}));
