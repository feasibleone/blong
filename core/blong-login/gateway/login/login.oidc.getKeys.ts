import {validation} from '@feasibleone/blong';

export default validation(
    async () =>
        function loginOidcGetKeys() {
            return {
                security: true,
                method: 'GET',
                path: '/jwks/:kid?',
                auth: false,
            };
        },
);
