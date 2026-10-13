import {handler, type IMeta} from '@feasibleone/blong';

import {SESSION_ALG} from '../../sessionToken.ts';

/**
 * session.oidc.getConfiguration — the discovery document a minted session's issuer is resolved from;
 * both addresses are derived from the request rather than configured.
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
