import {type IMeta, handler} from '@feasibleone/blong';

import {recallMleHandshake} from '../../mleHandshake.ts';

interface IIdentitySessionReply {
    'identity.check': {actorId: string; sessionId: string};
    permissionMap: string;
    mle?: {mlek: string; mlsk: string};
}

/**
 * identity.checkInternal — the session a verified caller's call is decrypted with, from the handshake
 * `login.token.create` recorded (`mleHandshake.ts`).
 */
export default handler(({errors}) => {
    return {
        async identityCheckInternal(
            params: {username?: string; installationId?: string} = {},
            $meta: IMeta,
        ): Promise<IIdentitySessionReply> {
            const actorId = String(params.username ?? params.installationId ?? '').trim();
            const handshake = actorId ? recallMleHandshake(actorId) : undefined;
            if (!handshake) {
                // Said here rather than left to the `Decryption failed` the gateway would report:
                // that message names neither the caller nor the reason, and it is thrown from a hook
                // that cannot tell a missing session from a tampered body.
                if (!$meta?.expect)
                    (this as unknown as {log?: {warn?: (entry: object) => void}}).log?.warn?.({
                        $meta: {mtid: 'event', method: 'identity.checkInternal'},
                        message:
                            `no MLE handshake is recorded for '${actorId || '(unnamed)'}' — ` +
                            'the caller has to log in again',
                    });
                throw errors['kustomize.sessionUnknown']({params: {actorId}});
            }

            // The reply is a plain object: a port answers with the packet `[value, $meta]`, and the
            // framework's session step reads the value out of it (`GatewayCodec.session` destructures
            // `[{ 'identity.check': … }]`) — so the array belongs to the transport, not to the handler.
            return {
                'identity.check': {actorId, sessionId: `cluster:${actorId}`},
                // Empty, and not a claim of the realm's: authorisation here is the cluster's
                // (the login review asked whether the identity may reconcile this suite), and
                // the methods it protects run as the process's own service account.
                permissionMap: '',
                // JSON, because the framework parses these two back into JWKs (`JSON.parse` in
                // `GatewayCodec.session`).
                mle: {
                    mlek: JSON.stringify(handshake.mlek),
                    mlsk: JSON.stringify(handshake.mlsk),
                },
            };
        },
    };
});
