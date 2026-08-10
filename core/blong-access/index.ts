import {server} from '@feasibleone/blong';

export default server(() => ({
    url: import.meta.url,
    children: [
        /** Built-in blong-server realm: RPC, auth, portal, auth orchestrators */
        async function srv() {
            return import('@feasibleone/blong-server/server.ts');
        },
        async function login() {
            return import('@feasibleone/blong-login/server.ts');
        },
        /** Core utility realm: shared resource/type/triple/path schema objects */
        async function core() {
            return import('@feasibleone/blong-core/server.ts');
        },
        /** RBAC access control realm */
        async function access() {
            return import('./server.ts');
        },
        /** Party realm — person records created by self-registration */
        async function party() {
            return import('@feasibleone/blong-party/server.ts');
        },
    ],
    config: {
        default: {
            srv: {},
            gateway: {authorize: 'access.authorization.list'},
        },
        dev: {
            srv: {
                db: {
                    // logLevel: 'debug',
                },
            },
            core: {},
            login: {},
            access: {},
            party: {},
        },
        integration: {
            watch: {
                test: [
                    'test.login.flow',
                    'test.authorization.flow',
                    'test.registration.flow',
                ],
            },
        },
    },
}));
