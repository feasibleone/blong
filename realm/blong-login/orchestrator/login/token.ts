import {library} from '@feasibleone/blong';
import {SignJWT, calculateJwkThumbprint, createLocalJWKSet, importJWK, type JWK} from 'jose';

/** The private members of a JWK: RSA's primes, EC's scalar, an octet key and its other primes. */
const PRIVATE_JWK_MEMBERS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k', 'oth'];

/**
 * The public half of a JWK: what a client verifies the server with and encrypts to, and all it may
 * have. The value published here is `gateway.public`, which `mle.ts` fills with `mle.keys` — public
 * JWKs today — but that is a property of one producer rather than of this endpoint, and the private
 * signing key behind this deployment mints the tokens the gateway verifies, so a `d` in this answer
 * would hand the deployment to every caller who can log in (T-274). The same mapping the keystore
 * below applies to its own keys, applied where the pair is published.
 */
const publicJwk = (jwk: object): object =>
    Object.fromEntries(Object.entries(jwk).filter(([name]) => !PRIVATE_JWK_MEMBERS.includes(name)));

export default library<{
    keys: {
        access: JWK;
        id: JWK;
    };
    expire: Record<string, number>;
}>(
    async ({
        config: {
            keys: {access, id},
            expire,
        },
        lib: {writeRefresh},
        gateway,
    }) => {
        const alg = access.alg || 'EdDSA';
        const kid = access.kid || (await calculateJwkThumbprint(access));
        const keyAccessToken = await importJWK(access, alg);
        const jwks = {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            keys: [access, id].filter(Boolean).map(({d, p, q, dp, dq, qi, ...pub}) => pub),
        };
        const keyStore = createLocalJWKSet(jwks);
        // A process that serves nothing has no gateway to ask for its public keys — the `k8s` intent
        // loads this realm for the plan's sake and serves no route at all — and the values are simply
        // absent there rather than fatal. A process that signs tokens runs with a gateway.
        const {public: keys} = gateway?.config?.() ?? {public: {sign: {}, encrypt: {}}};
        return {
            async jwks(
                header: Parameters<typeof keyStore>[0] = {},
                token: Parameters<typeof keyStore>[1],
            ) {
                return Object.keys(header).length ? keyStore(header, token) : jwks;
            },
            async token({
                clientId,
                actorId,
                sessionId,
                permissionMap,
                mlek,
                mlsk,
                refresh,
                actions,
                profile,
                ...rest
            }: {
                refresh?: number;
                mlek?: object | 'header';
                mlsk: object | 'header';
                actions?: string[];
                profile?: {actorId?: string; language?: string};
            } & Record<string, unknown>) {
                if (!refresh || refresh > expire.refresh) refresh = expire.refresh;
                refresh = expire.never || refresh;
                const access = expire.never || (expire.access > refresh ? refresh : expire.access);
                return {
                    encrypt: publicJwk(keys.encrypt),
                    sign: publicJwk(keys.sign),
                    token_type: 'Bearer',
                    scope: 'openid',
                    session_id: sessionId,
                    ...(profile !== undefined && {profile}),
                    access_token: await new SignJWT({
                        ...rest,
                        typ: 'Bearer',
                        ses: sessionId,
                        per: permissionMap,
                        ...(mlek && {enc: mlek}),
                        ...(mlsk && {sig: mlsk}),
                    })
                        .setProtectedHeader({alg, kid})
                        .setIssuedAt()
                        .setSubject(String(actorId))
                        .setIssuer('blong-login')
                        .setAudience('blong')
                        .setExpirationTime(access + 's')
                        .sign(keyAccessToken),
                    expires_in: access,
                    refresh_token: writeRefresh({
                        actorId,
                        sessionId,
                        clientId,
                        mlsk,
                        mlek,
                        refresh,
                        actions,
                        ...rest,
                    }),
                    refresh_token_expires_in: refresh,
                    permissions: actions ?? true,
                };
            },
        };
    },
);
