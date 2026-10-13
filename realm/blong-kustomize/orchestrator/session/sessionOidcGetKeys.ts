import {handler, type IMeta} from '@feasibleone/blong';
import type {JsonWebKey} from 'node:crypto';

import {sessionPublicKey} from '../../sessionToken.ts';

/**
 * session.oidc.getKeys — the key set a minted session is verified with, publishing only the public
 * half (@@D-448).
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
