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
                },
            },
        },
    },
}));
