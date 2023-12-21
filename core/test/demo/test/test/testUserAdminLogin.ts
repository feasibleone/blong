import { handler } from '@feasibleone/blong';

export default handler(proxy => ({
    testUserAdminLogin: ({name = 'login'}) => Object.defineProperty<unknown>([
        function createAdmin() {
            return {username: 'sa', password: '123'};
        },
        function loginAdmin() {
            return {accessToken: 'xxx'};
        }
    ], 'name', {value: name})
}));
