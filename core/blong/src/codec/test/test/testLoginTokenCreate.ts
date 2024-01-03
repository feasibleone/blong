import { handler } from '@feasibleone/blong';

export default handler(({
    handler: {
        loginTokenCreate,
    }
}) => ({
    testLoginTokenCreate: ({name = 'login token'}) => Object.defineProperty<unknown>([
        function login(assert, {$meta}) {
            return loginTokenCreate({
                username: 'test',
                password: 'test'
            }, $meta);
        },
    ], 'name', {value: name})
}));
