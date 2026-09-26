import {server} from '@feasibleone/blong';

export default server(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: [
        /**
         * blong-server gives the realms their subject dispatch, and with it the
         * `/rpc/ports/{namespace}/request` route every realm-to-realm call uses — the login
         * reaches the access realm that way.  Without it that route answers 404, which is what
         * the login failure in this package's memory was.
         */
        async function srv() {
            return import('@feasibleone/blong-server/server.ts');
        },
        /**
         * RBAC mock.  The login realm mints a token by calling `access.credential.check`, so
         * a suite that wants to log in needs *an* access realm — but not the real one, which
         * would drag in blong-core and a database.  The mock answers the credential check from
         * a constant and the `login.login.methods` config below skips the session methods, so
         * the demo stays database-free.
         */
        async function access() {
            return import('@feasibleone/blong-access-mock/server.ts');
        },
        async function login() {
            return import('@feasibleone/blong-login/server.ts');
        },
        './order',
    ],
    config: {
        default: {
            registry: {
                checkpointMode: 'test',
            },
            rpcServer: {
                port: 0,
            },
        },
        microservice: {},
        dev: {
            srv: {},
            access: {},
            login: {
                login: {
                    /** The mock keeps no sessions and records no audit rows. */
                    methods: {
                        sessionCreate: false,
                        auditRecord: false,
                        sessionCleanup: false,
                    },
                },
            },
            order: {},
        },
        integration: {
            watch: {
                test: [],
            },
        },
    },
}));
