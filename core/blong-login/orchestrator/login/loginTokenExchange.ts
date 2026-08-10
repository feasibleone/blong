import {type IMeta, handler} from '@feasibleone/blong';

type IdentityCheckResult = {
    userId: string;
    permissionMap: string;
    actions: string[];
    isNewUser: boolean;
};

/**
 * Social login token exchange — the counterpart of `login.token.create` for
 * OAuth code flows.  Delegates identity resolution to the access realm
 * (`access.identity.check`) and mints a JWT with the resolved permission map.
 * `flow` selects the Google identity flow per call (`oidc` default, `oauth`).
 */
export default handler(
    ({lib: {token}, handler: {accessIdentityCheck}}) =>
        async function loginTokenExchange(
            params: {
                provider: string;
                code: string;
                state?: string;
                redirectUri?: string;
                flow?: 'oidc' | 'oauth';
            },
            $meta: IMeta,
        ) {
            const {userId, permissionMap, actions, isNewUser} = (await accessIdentityCheck(
                {
                    provider: params.provider,
                    code: params.code,
                    redirectUri: params.redirectUri,
                    flow: params.flow,
                },
                // Forward $meta for tracing – the handler proxy attaches
                // the method name and routing info automatically.
                $meta,
            )) as IdentityCheckResult;

            const result = (await token({
                clientId: params.provider,
                actorId: userId,
                sessionId: 'session',
                language: 'en',
                refresh: '',
                permissionMap,
                mlek: $meta?.auth?.mlek,
                mlsk: $meta?.auth?.mlsk,
                actions,
            })) as Record<string, unknown>;

            return {...result, isNewUser};
        },
);
