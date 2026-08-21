import {browser} from '@feasibleone/blong';
import pkg from './package.json' with {type: 'json'};

export default browser(blong => ({
    url: import.meta.url,
    pkg: {
        name: pkg.name,
        version: pkg.version,
    },
    validation: blong.type.Object({
        party: blong.type.Object({}),
        access: blong.type.Object({}),
    }),
    children: [
        async function ui() {
            return import('@feasibleone/blong-browser/browser.ts');
        },
        async function login() {
            return import('@feasibleone/blong-login/browser.ts');
        },
        async function party() {
            return import('./browser.ts');
        },
        /** blong-access browser realm — access.* subject namespace + the self-service profile page. */
        async function access() {
            return import('@feasibleone/blong-access/browser.ts');
        },
    ],
    config: {
        default: {
            ui: {
                portal: {
                    portal: {
                        title: 'Blong Party',
                        // Self-service profile: the top-right account menu opens
                        // the profile tab and fetches the caller's profile for the
                        // avatar (personal details live on party.person here).
                        profile: {
                            page: 'access.user.profile',
                            get: 'access.profile.get',
                        },
                    },
                    // Self-registration: Login's Register button dispatches
                    // component/user.selfRegistration (party component layer).
                    login: {registerPage: 'user.selfRegistration'},
                    // Google OAuth fallback (e.g. Storybook / offline).  The
                    // browser fetches the live config at runtime from the
                    // backend's `access.google.get` endpoint; this static mock
                    // only keeps the button visible and covers the no-backend case.
                    google: {
                        baseUrl: 'http://localhost:9082',
                        clientId: 'mock-client',
                        redirectUri: 'http://localhost:9101/s/oauth/callback',
                    },
                },
                auth: {
                    google: {
                        baseUrl: 'http://localhost:9082',
                        clientId: 'mock-client',
                        redirectUri: 'http://localhost:9101/s/oauth/callback',
                    },
                },
            },
            login: {},
            party: {},
            access: {},
        },
        // TEST-ONLY: the `integration` intent (active for dev/test/Playwright
        // — the browser entry `index.html.ts` hardcodes `microservice
        // integration dev`) enables the test hook that exposes the wrapped
        // handler as `window.__blongHandler` so E2E tests can invoke server
        // methods directly. Production uses the `prod` intent — never
        // `integration` — so real deployments do not expose the handler.
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
