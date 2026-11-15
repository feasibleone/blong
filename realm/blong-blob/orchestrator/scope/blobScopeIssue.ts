import type {IMeta} from '@feasibleone/blong';

import {blobScopeSign} from '../../blob/blobScope.ts';
import {blobScopeCollect} from '../../blob/blobScopeCollect.ts';
import {blobPortConfig, blobSettings} from '../../blob/blobSettings.ts';
import {handler} from './handlerGroup.ts';

/** A provider's method (`party.scope.grant`) and the proxy name it answers to (`partyScopeGrant`). */
function proxyName(method: string): string {
    return method
        .split('.')
        .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
        .join('');
}

type ProviderCall = (params: object, $meta: IMeta) => Promise<unknown>;

/**
 * `blob.scope.issue` — collect the caller's scopes and set the cookie the read path trusts.
 *
 * The actor comes from `$meta.auth`, never from the parameters: a caller that could name the actor
 * could ask for somebody else's scopes. The providers are the realms that know what a scope means —
 * this realm does not, which is why it asks (@@D-836). The cookie is path-scoped to `/a/` and is the
 * only credential the serving route accepts.
 */
export default handler(({errors, config, handler}) => ({
    async blobScopeIssue(
        params: {scopes?: string[]},
        $meta: IMeta,
    ): Promise<{scopes: string[]; expiresIn: number}> {
        const settings = blobSettings(config, blobPortConfig(this));
        const actorId = $meta?.auth?.actorId === undefined ? undefined : String($meta.auth.actorId);
        const answers: unknown[] = [];
        for (const provider of settings.scope.providers) {
            const call = (handler as Record<string, ProviderCall | undefined>)[proxyName(provider)];
            if (typeof call !== 'function') {
                throw errors['blob.configurationError']({
                    params: {reason: `scope provider "${provider}" is not registered`},
                });
            }
            answers.push(await call({}, $meta));
        }
        if (Array.isArray(params?.scopes)) answers.push(params.scopes);

        const scopes = blobScopeCollect(answers, actorId);
        const {ttl, secret, name, path} = settings.cookie;
        if (secret) {
            const value = blobScopeSign(
                {actorId, scopes, exp: Math.floor(Date.now() / 1000) + ttl},
                secret,
            );
            $meta.httpResponse = {
                state: [
                    [
                        name,
                        value,
                        {
                            ttl: ttl * 1000,
                            isSecure: true,
                            isHttpOnly: true,
                            isSameSite: 'lax',
                            path,
                        },
                    ],
                ],
            };
        }
        return {scopes, expiresIn: ttl};
    },
}));
