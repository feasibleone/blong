import {handler, type IMeta} from '@feasibleone/blong';

import {SESSION_ALG} from '../../sessionToken.ts';

/**
 * session.oidc.getConfiguration — the discovery document a minted session's issuer is resolved from.
 *
 * The framework verifies a bearer against a configured issuer by *reading* that issuer's
 * `.well-known/openid-configuration` over HTTP and then the key set it names there. A deployment that
 * mints its own tokens therefore has to answer for an issuer, and the shortest honest address for that
 * answer is its own gateway — which is what the entry configures (`remote.openId` names the issuer and
 * this document), so no second service is dialled and none has to exist.
 *
 * Both addresses are derived from the request rather than configured, the way the framework's own login
 * realm derives its own: the framework fetched this document at the address the deployment configured,
 * so the issuer is that address with the document's own name removed, and the key set sits beside it.
 * A configured copy would be a second string to keep in step with the token's `iss`, and the one thing
 * that cannot drift is the value the token names.
 *
 * The route is public by construction (`auth: false` in the gateway file beside this one): it is read
 * before any token is verified, and what it publishes is a public key set's address and nothing besides.
 */
export default handler(() => {
    return {
        sessionOidcGetConfiguration(
            _params: object = {},
            $meta?: IMeta,
        ): {
            issuer: string;
            jwks_uri: string;
            id_token_signing_alg_values_supported: string[];
        } {
            const asked = $meta?.httpRequest?.url;
            if (!asked) {
                throw new Error('the discovery document needs the request URL to name its issuer');
            }
            // `..` drops the document's own last segment, so the issuer is the directory it was read
            // from — and `jwks` up one level from the document is the address the module next door
            // answers on (`/session/jwks`, not `/session/.well-known/jwks`).
            const url = new URL(asked);
            return {
                issuer: new URL('..', url).href,
                jwks_uri: new URL('../jwks', url).href,
                id_token_signing_alg_values_supported: [SESSION_ALG],
            };
        },
    };
});
