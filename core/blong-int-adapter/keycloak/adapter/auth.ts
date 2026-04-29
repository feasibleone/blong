import {adapter} from '@feasibleone/blong';

export default adapter<{
    keycloak: {
        baseUrl: string;
        realmName?: string;
        username?: string;
        password?: string;
        grantType?: 'password' | 'client_credentials';
    };
}>(() => ({
    extends: 'adapter.keycloak',
    activation: {
        default: {
            keycloak: {
                baseUrl: 'http://localhost:8180',
                realmName: 'master',
                username: 'blong-admin',
                password: 'password',
                grantType: 'password',
            },
            namespace: 'auth',
            imports: [],
        },
    },
}));
