import {server} from '@feasibleone/blong';

/**
 * index.ts — standalone server bootstrap for `$subject` integration tests.
 *
 * Only the `$subject` realm is a child. The runtime realms it reuses —
 * blong-server (`srv`), login, core and access — are loaded by the framework from
 * this package's manifest (`frameworkRealms` in the loader), so naming them here
 * again would register every handler twice. The `dev` blocks below still name
 * them, because a config block is where a realm is configured and not a child
 * declaration.
 *
 * RBAC is enforced on the gateway: the access realm resolves the caller's allowed
 * actions, and a call without one is answered 403.
 */
export default server(() => ({
    url: import.meta.url,
    children: [
        /** `$subject` management realm */
        async function $subject() {
            return import('./server.ts');
        },
    ],
    config: {
        default: {
            // Enforce RBAC on the gateway — resolves allowed actions for the
            // authenticated user (access realm), 403 when not authorized.
            gateway: {authorize: 'access.authorization.list'},
        },
        dev: {
            srv: {},
            core: {},
            access: {},
            $subject: {},
            login: {},
        },
        integration: {
            watch: {
                test: ['test.$object'],
            },
        },
    },
}));
