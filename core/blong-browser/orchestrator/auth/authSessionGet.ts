import {type IMeta, handler} from '@feasibleone/blong';

type RestoreResult = {
    access_token?: string;
    permissions?: string[] | boolean;
    profile?: Record<string, unknown>;
};

/**
 * Boot-time session restore (`auth.session.get`).
 *
 * Called once when the app shell mounts.  It exchanges the path-scoped,
 * HttpOnly restore cookie (set at login) for fresh tokens at
 * `login.token.restore` — if a live session exists the login screen is
 * skipped and the token + permissions are fed to the store.  The MLE codec
 * (`loginTokenRestoreResponseReceive`) already stored the tokens in memory,
 * so subsequent requests are authenticated automatically.
 *
 * Returns `{authenticated: false}` when there is no cookie or the session is
 * no longer valid (revoked / inactive / expired) — the user must log in.
 */
export default handler(
    ({handler: {loginTokenRestore}}) =>
        async function authSessionGet(
            _params: object,
            $meta: IMeta,
        ): Promise<{authenticated: boolean; token?: string; permissions?: string[]}> {
            try {
                const result = (await loginTokenRestore({}, $meta)) as RestoreResult | undefined;
                if (!result?.access_token) return {authenticated: false};

                const {useAppStore} = await import('../../src/state/appStore.js');
                const store = useAppStore.getState();
                store.setToken(result.access_token);
                if (result.permissions)
                    store.setPermissions(
                        typeof result.permissions === 'boolean'
                            ? result.permissions
                            : Object.fromEntries(
                                  (result.permissions as string[]).map(p => [p, true]),
                              ),
                    );
                if (result.profile)
                    store.setProfile(
                        result.profile as Parameters<typeof store.setProfile>[0],
                    );
                // Apply the user's preferred language (returned during restore)
                // so the UI locale matches their profile.
                const language = (result.profile as {language?: string}).language;
                if (language) store.setLanguage(language);
                return {
                    authenticated: true,
                    token: result.access_token,
                    permissions:
                        typeof result.permissions === 'boolean'
                            ? undefined
                            : result.permissions,
                };
            } catch {
                return {authenticated: false};
            }
        },
);
