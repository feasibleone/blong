import {adapter} from '@feasibleone/blong';

export default adapter<{
    keycloak: {
        baseUrl: string;
        realmName?: string;
        username?: string;
        password?: string;
        grantType?: 'password' | 'client_credentials';
    };
}>(api => ({
    extends: 'adapter.keycloak',
    activation: {
        default: {
            keycloak: {
                baseUrl: 'http://localhost:30080',
                realmName: 'master',
                username: 'admin',
                password: 'admin',
                grantType: 'password',
            },
            namespace: 'auth',
            imports: [],
        },
    },
}));
