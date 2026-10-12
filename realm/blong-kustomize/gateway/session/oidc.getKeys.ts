import {validation} from '@feasibleone/blong';

/**
 * gateway/session/oidc.getKeys.ts — the key set, served without a bearer.
 *
 * `session.oidc.getKeys`, at `/rpc/session/jwks`: the address the discovery document derives for
 * `jwks_uri` and the framework fetches while verifying a minted token. Public for the same reason the
 * document beside it is — a key set is read before anything is verified, and it is public key material
 * by definition.
 */
export default validation(
    async () =>
        function sessionOidcGetKeys() {
            return {
                security: true,
                method: 'GET',
                path: '/jwks',
                auth: false,
            };
        },
);
