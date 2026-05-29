import {validation} from '@feasibleone/blong';

export default validation(
    async () =>
        function loginOidcGetConfiguration() {
            return {
                security: true,
                method: 'GET',
                path: '/.well-known/openid-configuration',
                auth: false,
            };
        },
);
