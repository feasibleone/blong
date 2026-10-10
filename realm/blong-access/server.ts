import {realm} from '@feasibleone/blong';

export default realm(() => ({
    url: import.meta.url,
    config: {
        default: {
            // Carried in-process by every process *and* published as an admin API, so `both` —
            // declared by the realm itself rather than by the suite that deploys it (D-433).
            k8s: {k8sRealmRole: 'both'},
            // Fallback credential-function parameters for newly created
            // credentials.  The active `access.policy` for the credential
            // type overrides these; these defaults only apply when no
            // policy provides them.  `function` names the algorithm used
            // to derive the credential secret (currently `hash`).
            //
            // `iterations` is deliberately *not* pinned by the shipped policy
            // (`meta/db/accessAuthorizationMerge.yaml`), so the environment decides
            // how expensive a derivation is: production keeps the 100000 below,
            // while `dev` and `ci` drop to a single iteration.  A suite signs in
            // hundreds of times and pays the derivation on every login, where a
            // dev or CI password protects nothing.  The resolved parameters travel
            // with the credential (`credentialParamsJSON`), so fixtures seeded in
            // those environments verify cheaply while production stays hard.
            db: {
                password: {
                    function: 'hash',
                    algorithm: 'pbkdf2',
                    iterations: 100000,
                    keyLength: 64,
                    digest: 'sha512',
                },
            },
        },
        dev: {
            db: {
                // Local Google OAuth mock for dev/integration testing.  Production
                // suites override this (or omit it) to use the real Google
                // endpoints (see accessIdentityCheck).
                google: {
                    baseUrl: 'http://localhost:9082',
                    clientId: 'mock-client',
                    clientSecret: 'mock-secret',
                    redirectUri: 'http://localhost:9101/oauth/callback',
                }, // One PBKDF2 iteration — see the `default` comment above.  A local
                // login is not a security boundary the way a deployed one is.
                password: {iterations: 1},
            },
        },
        ci: {
            db: {
                // `ci` is a platform intent the loader adds when the process runs
                // on CI, so this covers every suite's integration run there.  One
                // iteration, as in `dev`: the suites' own logins are the load.
                password: {iterations: 1},
            },
        },
    },
}));
