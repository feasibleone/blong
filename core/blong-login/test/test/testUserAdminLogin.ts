import {handler} from '@feasibleone/blong';

export default handler(({lib: {rename}}) => ({
    testUserAdminLogin: ({name = 'login'}) =>
        rename<unknown>(
            [
                function createAdmin() {
                    return {username: 'sa', password: '123'};
                },
                function loginAdmin() {
                    return {accessToken: 'xxx'};
                },
            ],
            name
        ),
}));
