import {type IMeta, handler} from '@feasibleone/blong';

type ExchangeParams = {
    code: string;
    state?: string;
    redirectUri?: string;
};

type LoginResult = {
    step: 'success' | 'credentials';
    token?: string;
    error?: string;
};

/**
 * Google OAuth login — swaps the authorization code for a session token.
 *
 * Calls the server's `login.token.exchange` (code → Google tokens → verified
 * identity → JWT), stores the token + permissions, and marks the app
 * authenticated — the same storage path `authLogin` uses.
 */
export default handler(
    ({handler: {loginTokenExchange, storageTokenSet, storagePermissionsSet}}) =>
        async function authGoogleLogin(params: ExchangeParams, $meta: IMeta): Promise<LoginResult> {
            try {
                const result = (await loginTokenExchange(
                    {
                        provider: 'google',
                        code: params.code,
                        state: params.state,
                        redirectUri: params.redirectUri,
                    },
                    $meta,
                )) as {
                    access_token?: string;
                    permissions?: string[] | boolean;
                    isNewUser?: boolean;
                } | undefined;

                if (!result?.access_token) return {step: 'credentials', error: 'No token returned'};

                await storageTokenSet({token: result.access_token}, $meta);
                if (result.permissions)
                    await storagePermissionsSet({permissions: result.permissions}, $meta);

                const {useAppStore} = await import('../../src/state/appStore.js');
                const store = useAppStore.getState();
                store.setToken(result.access_token);
                if (result.permissions)
                    store.setPermissions(
                        typeof result.permissions === 'boolean'
                            ? result.permissions
                            : Object.fromEntries(result.permissions.map(p => [p, true])),
                    );

                return {step: 'success', token: result.access_token};
            } catch (err: unknown) {
                const typed = err as {message?: string};
                return {step: 'credentials', error: typed?.message ?? 'Google login failed'};
            }
        },
);
