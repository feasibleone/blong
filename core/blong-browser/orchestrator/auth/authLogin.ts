import {type IMeta, handler} from '@feasibleone/blong';

type LoginParams = {
    userName: string;
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
    token?: string;
    permissions?: string[];
    profile?: Record<string, unknown>;
};

export default handler(
    ({
        handler: {
            'backend.login.token.create': loginTokenCreate,
            storageTokenSet,
            storagePermissionsSet,
        },
    }) =>
        async function authLogin(params: LoginParams, $meta: IMeta): Promise<LoginResult> {
            try {
                const result = (await loginTokenCreate(
                    {username: params.userName, password: params.password},
                    $meta,
                )) as BackendResult | undefined;

                if (!result?.token) return {step: 'credentials', error: 'No token returned'};

                await storageTokenSet({token: result.token}, $meta);
                if (result.permissions)
                    await storagePermissionsSet({permissions: result.permissions}, $meta);

                const {useAppStore} = await import('../../src/state/appStore.js');
                const store = useAppStore.getState();
                store.setToken(result.token);
                if (result.permissions) store.setPermissions(result.permissions);
                if (result.profile)
                    store.setProfile(result.profile as Parameters<typeof store.setProfile>[0]);

                return {step: 'success', token: result.token};
            } catch (err: unknown) {
                const typed = err as {type?: string; message?: string};
                if (typed?.type === 'error.login.otp.required') return {step: 'otp'};
                if (typed?.type === 'error.login.password.change') return {step: 'newPassword'};
                return {step: 'credentials', error: typed?.message ?? 'Login failed'};
            }
        },
);
