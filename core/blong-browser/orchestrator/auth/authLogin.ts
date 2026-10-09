import {type IMeta, handler} from '@feasibleone/blong';

type LoginParams = {
    username: string;
    password: string;
    newPassword?: string;
    otpCode?: string;
};

type LoginResult = {
    step: 'success' | 'otp' | 'newPassword' | 'credentials';
    token?: string;
    error?: string;
};

type BackendResult = {
    access_token?: string;
    permissions?: string[];
    profile?: Record<string, unknown>;
};

export default handler(
    ({handler: {loginTokenCreate, storageTokenSet, storagePermissionsSet}}) =>
        async function authLogin(params: LoginParams, $meta: IMeta): Promise<LoginResult> {
            try {
                const result = (await loginTokenCreate(
                    {username: params.username, password: params.password},
                    $meta,
                )) as BackendResult | undefined;

                // A response without a token is the failure mode that hides: the form stays up,
                // nothing is thrown, and the caller renders no message. Warn with what came back so
                // a missing binding, a rejected credential and a half-configured realm are told
                // apart from the log rather than from the screen (F-371).
                if (!result?.access_token)
                    this.log?.warn?.({
                        $meta: {mtid: 'event', method: 'auth.login'},
                        message: `login response carried no access_token: ${JSON.stringify(result)?.slice(0, 300)}`,
                    });

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
                if (result.profile) {
                    store.setProfile(result.profile as Parameters<typeof store.setProfile>[0]);
                    // Apply the user's preferred language (returned during
                    // login) so the UI locale matches their profile.
                    const language = (result.profile as {language?: string}).language;
                    if (language) store.setLanguage(language);
                }

                return {step: 'success', token: result.access_token};
            } catch (err: unknown) {
                const typed = err as {type?: string; message?: string};
                // A throw here is the other silent ending: the form keeps asking, so the reason has
                // to reach the log at warn level (F-371).
                this.log?.warn?.({
                    $meta: {mtid: 'event', method: 'auth.login'},
                    message: `login call failed: ${typed?.type ?? 'error'}: ${typed?.message ?? String(err)}`,
                });
                if (typed?.type === 'error.login.otp.required') return {step: 'otp'};
                if (typed?.type === 'error.login.password.change') return {step: 'newPassword'};
                return {step: 'credentials', error: typed?.message ?? 'Login failed'};
            }
        },
);
