import {browser} from '@feasibleone/blong';
import pkg from './package.json' with {type: 'json'};

/**
 * index.browser.ts — standalone browser bootstrap for blong-access.
 *
 * Wires the built-in blong-browser realm (portal, RPC, auth) around the access
 * realm so the access model pages (Browse/New/Open) can run against the live
 * server, e.g. for the Playwright suite of this package.
 */
export default browser(blong => ({
    url: import.meta.url,
    pkg: {
        name: pkg.name,
        version: pkg.version,
    },
    validation: blong.type.Object({
        login: blong.type.Object({}),
        access: blong.type.Object({}),
    }),
    children: [
        /** Built-in blong-browser realm: RPC, auth, portal, auth orchestrators */
        async function ui() {
            return import('@feasibleone/blong-browser/browser.ts');
        },
        /** blong-login browser realm — `login.*` subject namespace (login.token.* etc.) */
        async function login() {
            return import('@feasibleone/blong-login/browser.ts');
        },
        /** blong-access realm (brings the access models + browser namespace) */
        async function access() {
            return import('./browser.ts');
        },
    ],
    config: {
        default: {
            ui: {
                portal: {
                    portal: {
                        title: 'Blong Access',
                        // Self-service profile: the top-right account menu
                        // (`page`) opens the profile tab, and fetches the
                        // caller's own profile (`get`) for the avatar initials.
                        profile: {
                            page: 'access.user.profile',
                            get: 'access.profile.get',
                        },
                        // Per-language translation dictionaries.  blong-browser
                        // registers them at boot and `setLanguage(language)`
                        // (driven by the user's preferred language returned at
                        // login) swaps the active table to the matching
                        // language's dictionary — English uses an empty dict
                        // (fall back to the English strings).
                        translations: {
                            en: {},
                            bg: {
                                'Profile': 'Профил',
                                'Sign out': 'Отписване',
                                'First Name': 'Собствено име',
                                'Last Name': 'Фамилия',
                                'Email': 'Имейл',
                                'Preferred Language': 'Предпочитан език',
                                'Profile saved': 'Профилът е запазен',
                                'Save': 'Запази',
                                'Change Password': 'Смяна на парола',
                                'Current Password': 'Текуща парола',
                                'New Password': 'Нова парола',
                                'Confirm New Password': 'Потвърди новата парола',
                                'Password changed': 'Паролата е сменена',
                                'Roles': 'Роли',
                                'No roles assigned': 'Няма присвоени роли',
                                'Passwords do not match': 'Паролите не съвпадат',
                                'Active': 'Активен',
                                'Inactive': 'Неактивен',
                            },
                        },
                        // UI languages offered by the menubar language switcher
                        // (ad-hoc, client-side switching).  `value` matches a
                        // translation-dictionary key above.
                        languages: [
                            {value: 'en', label: 'English'},
                            {value: 'bg', label: 'Български'},
                        ],
                    },
                },
            },
            login: {},
            access: {},
        },
        // TEST-ONLY: the `integration` intent (active in the browser for
        // dev/test/Playwright runs — the browser entry `index.html.ts`
        // hardcodes `microservice integration dev`) enables the test hook that
        // exposes the wrapped handler as `window.__blongHandler` (gated in
        // BlongContext by `portal.testHook`) so E2E tests can invoke server
        // methods directly.  Production uses the `prod` intent — never
        // `integration` — so real deployments do not expose the handler.
        // (The cast is a framework typing limitation: non-default intent
        // blocks only type the realm's own validation keys, while child-realm
        // config like `ui` is allowed at runtime via `activeConfigs`.)
        integration: {
            ui: {
                portal: {
                    portal: {
                        testHook: true,
                    },
                },
            },
        } as never,
    },
}));
