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
    ],
    config: {
        default: {
            srv: {},
            gateway: {
                authorize: 'access.authorization.list',
                // Record every access decision (allow/deny) + access-table DML
                // in the append-only audit.  Best-effort and non-blocking.
                audit: {handler: 'access.audit.record'},
            },
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
        },
        integration: {
            // Short access-token TTL + long inactivity so the session-reload /
            // login-popup Playwright tests can observe expiry without breaking
            // other flows (refresh keeps sessions active: inactivity > access TTL).
            // The login realm wraps its config in a `login` key, so the override
            // nests one level deeper.
            login: {
                login: {
                    expire: {
                        code: 60,
                        access: 30,
                        cookie: 3600,
                        refresh: 3600,
                        nonce: 900,
                        inactivity: 38,
                        deleteAfter: 3600,
                    },
                },
            },
            watch: {
                test: [
                    'test.login.flow',
                    'test.authorization.flow',
                    'test.access.model.flow',
                    'test.session.flow',
                    'test.profile.flow',
                ],
            },
        },
    },
}));
