import {handler} from '@feasibleone/blong';

/**
 * The self-registration page, loaded when the portal opens it.
 *
 * Importing the page from this registration — rather than at the top of the module —
 * is what keeps the browser library out of the login screen. `selfRegistrationPage.tsx`
 * imports `SelfRegistration` and `useBlong` from the package root, and a dev server does
 * not tree-shake, so one static import here made every app that mounts `party` fetch
 * every widget, viewer, editor and test-run module before the login form could paint:
 * blong-sport's login screen fetched 478 scripts and 11.5 MB, against 272 scripts for an
 * app that does not mount this realm. A registration is already a factory — the portal
 * awaits `component()` — so the import belongs inside it (`@@D-747`).
 */
export default handler(function userRegistration() {
    return {
        'user.selfRegistration': async () => ({
            title: 'Register',
            component: async () => (await import('./selfRegistrationPage.js')).SelfRegistrationPage,
        }),
    };
});
