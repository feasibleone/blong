import { validation } from '@feasibleone/blong';

export default validation(proxy => function loginOidcGetKeys() {
    return {
        security: true,
        method: 'GET',
        path: '/jwks/:kid?',
        auth: false
    };
});
