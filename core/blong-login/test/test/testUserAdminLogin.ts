import {handler} from '@feasibleone/blong';

export default handler(({lib: {group}}) => ({
    testUserAdminLogin: ({name = 'login'}) =>
        group(name)([
            function createAdmin() {
                return {username: 'sa', password: '123'};
            },
            function loginAdmin() {
                return {accessToken: 'xxx'};
            },
        ]),
}));
