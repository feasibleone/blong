import {handler} from '@feasibleone/blong';

/**
 * `access.user.profile` — custom browser page showing the authenticated
 * user's own profile (self-service). Opened by the portal account menu
 * (`IPortalConfig.profile.page`); the page's data comes from the
 * `access.profile.get` / `.edit` / `.password.change` server methods.
 *
 * The page JSX lives in `src/pages/` (outside the well-known browser layer
 * folders) and is loaded lazily — the Node tap runner loads this handler
 * without ever resolving the `.tsx` (which only Vite can bundle).
 */
export default handler(function accessUserProfile() {
    return {
        'access.user.profile': async () => ({
            title: 'Profile',
            component: async () => {
                const {AccessUserProfilePage} = await import('../../../src/pages/accessUserProfilePage.js');
                return AccessUserProfilePage;
            },
        }),
    };
});
