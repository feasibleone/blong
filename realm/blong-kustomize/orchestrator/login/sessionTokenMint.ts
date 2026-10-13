import {library, type IMeta} from '@feasibleone/blong';
import type {JsonWebKey} from 'node:crypto';

import type {IPlanConfig} from '../../plan.ts';
import {SESSION_ALG, signSessionToken} from '../../sessionToken.ts';

/** What the login hands the mint: the caller's name, its keys, and who the cluster said it is. */
export interface ISessionMintParams {
    /** The name the caller logged in as — what the token's `sub` becomes. */
    username: string;
    /** The identity the cluster verified the presented bearer as. */
    clusterUser?: string;
    /** The caller's own public keys, which rode in the header of its login call. */
    mlek?: object;
    mlsk?: object;
}

/**
 * session.token.mint — the session token the realm's login hands back, signed with the gateway's own
 * key (@@F-494 @@F-500).
 */
export default library(
    async ({
        config,
        errors,
    }: {
        config: IPlanConfig;
        errors: Record<string, (params: {params: object}) => Error>;
    }) => {
        return {
            async sessionTokenMint(params: ISessionMintParams, $meta?: IMeta): Promise<string> {
                const session = config?.session;
                const issuer = session?.issuer;
                if (!issuer) {
                    throw errors['kustomize.sessionUnconfigured']({
                        params: {reason: 'no `kustomize.login.session.issuer` is configured'},
                    });
                }
                const jwk = session?.key as JsonWebKey | undefined;
                if (!jwk) {
                    throw errors['kustomize.sessionUnconfigured']({
                        params: {
                            reason:
                                "no `kustomize.login.session.key` is configured — the gateway's own " +
                                'config carries only the public half (D-448)',
                        },
                    });
                }
                const alg = typeof jwk.alg === 'string' ? jwk.alg : SESSION_ALG;
                if (alg !== SESSION_ALG) {
                    throw errors['kustomize.sessionUnconfigured']({
                        params: {
                            reason: `the configured session key is ${alg}, not ${SESSION_ALG}`,
                        },
                    });
                }
                // No session store to consult: the token *is* the session, and a mismatched `$meta`
                // would only tell us the caller is not the one the framework is asking about.
                void $meta;
                return signSessionToken(jwk, {
                    username: params.username,
                    issuer,
                    audience: session?.audience ?? 'blong',
                    expiresIn: session?.expiresIn ?? 8 * 60 * 60,
                    // One login, one session id. It is the claim that tells the framework the caller
                    // already has a session, so it never asks the `identity` namespace for one.
                    sessionId: `session:${params.username}:${Date.now()}`,
                    permissionMap: '',
                    ...(params.clusterUser ? {clusterUser: params.clusterUser} : {}),
                    ...(params.mlek ? {mlek: params.mlek} : {}),
                    ...(params.mlsk ? {mlsk: params.mlsk} : {}),
                });
            },
        };
    },
);
