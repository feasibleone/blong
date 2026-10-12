import {handler, type IMeta} from '@feasibleone/blong';
import type {JsonWebKey} from 'node:crypto';

import {sessionPublicKey} from '../../sessionToken.ts';

/**
 * session.oidc.getKeys — the key set a minted session is verified with.
 *
 * The public half of the gateway's own sign key, published where the discovery document says it is
 * (`session.jwksUri`). This is the whole of what makes a minted token verifiable: the framework reads
 * the key set once per issuer, keeps it, and checks every bearer against it — so a session survives a
 * restart and a second replica, because the pair belongs to the suite and not to a process
 * (T-252 is the same reasoning for the pair itself; `kustomizeGatewayKeysEnsure` generates it).
 *
 * Only the public half is published, by `publicSessionJwk` — the same filter the framework's login
 * realm applies before it answers its own key set, and the reason `gateway.config()` is protected
 * there: the private half must never leave the process (D-448).
 *
 * Public like the discovery document beside it: a key set is fetched before verification, and it is
 * public key material by definition.
 */
export default handler(({gateway, errors}) => {
    return {
        sessionOidcGetKeys(_params: object = {}, $meta?: IMeta): {keys: JsonWebKey[]} {
            const sign = (gateway as unknown as {config?: () => {sign?: JsonWebKey}})?.config?.()
                ?.sign;
            if (!sign) {
                throw errors['kustomize.sessionUnconfigured']({
                    params: {reason: 'this gateway has no sign key to publish'},
                });
            }
            void $meta;
            return {keys: [sessionPublicKey(sign)]};
        },
    };
});
