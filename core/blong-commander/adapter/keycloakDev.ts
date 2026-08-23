import {adapter} from '@feasibleone/blong';

/**
 * `keycloak-dev` adapter instance — Keycloak explorer source for the commander
 * dev suite. Namespace `keycloak-dev` so `keycloak-dev.realm.list` /
 * `keycloak-dev.user.find` reach this instance.
 */
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
            namespace: 'keycloak-dev',
            imports: [],
        },
    },
}));
