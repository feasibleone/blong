import {type IMeta, handler} from '@feasibleone/blong';

/**
 * Logout (`auth.logout`).
 *
 * Revokes the server-side session (`login.token.revoke` — also clears the
 * restore cookie), deletes any local token marker and resets the React auth
 * state.  Already-issued access tokens remain valid until they expire but
 * cannot be renewed, so a subsequent reload shows the login screen.
 */
export default handler(
    ({handler: {storageTokenDelete, loginTokenRevoke}}) =>
        async function authLogout(_params: object, $meta: IMeta): Promise<void> {
            try {
                await loginTokenRevoke({}, $meta);
            } catch {
                // Best effort — clear local state regardless.
            }
            await storageTokenDelete({}, $meta);
            const {useAppStore} = await import('../../src/state/appStore.js');
            useAppStore.getState().logout();
        },
);
