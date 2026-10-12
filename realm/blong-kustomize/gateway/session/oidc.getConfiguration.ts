import {validation} from '@feasibleone/blong';

/**
 * gateway/session/oidc.getConfiguration.ts — the discovery document, served without a bearer.
 *
 * The folder is the namespace and the file names the rest, so the method is
 * `session.oidc.getConfiguration` — the handler this realm keeps beside it — and `path` replaces the
 * object and predicate it would otherwise produce. The route is therefore
 * `/rpc/session/.well-known/openid-configuration`, which is the address the deployment configures as
 * the issuer's discovery URL and the one the document derives its own issuer from.
 *
 * `auth: false` is the whole point of the file: the framework reads an issuer's discovery document
 * *while* verifying a token, so a route that demanded one would refuse the request that needs it. The
 * framework's own login realm serves its own document exactly this way (`login.oidc.getConfiguration`).
 */
export default validation(
    async () =>
        function sessionOidcGetConfiguration() {
            return {
                security: true,
                method: 'GET',
                path: '/.well-known/openid-configuration',
                auth: false,
            };
        },
);
