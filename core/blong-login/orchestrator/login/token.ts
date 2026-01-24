import {library} from '@feasibleone/blong';
import {SignJWT, calculateJwkThumbprint, createLocalJWKSet, importJWK, type JWK} from 'jose';

export default library<{
    keys: {
        access: JWK;
        id: JWK;
    };
    expire: Record<string, string>;
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
            keys: [access, id].filter(Boolean).map(({d, p, q, dp, dq, qi, ...pub}) => pub),
        };
        const keyStore = createLocalJWKSet(jwks);
        const {public: keys} = gateway.config();
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
                ...rest
            }: Record<string, unknown>) {
                if (!refresh || refresh > expire.refresh) refresh = expire.refresh;
                refresh = expire.never || refresh;
                const access = expire.never || (expire.access > refresh ? refresh : expire.access);
                return {
                    encrypt: keys.encrypt,
                    sign: keys.sign,
                    token_type: 'Bearer',
                    scope: 'openid',
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
                        .setIssuer('ut-login')
                        .setAudience('ut-bus')
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
                        ...rest,
                    }),
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    refresh_token_expires_in: refresh,
                };
            },
        };
    },
);
