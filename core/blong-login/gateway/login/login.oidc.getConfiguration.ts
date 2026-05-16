import { validation } from '@feasibleone/blong';

export default validation(() => function loginOidcGetConfiguration() {
    return {
        security: true,
        method: 'GET',
        path: '/.well-known/openid-configuration',
        auth: false
    };
});
