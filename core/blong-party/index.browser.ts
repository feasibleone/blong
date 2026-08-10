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
    }),
    children: [
        async function ui() {
            return import('@feasibleone/blong-browser/browser.ts');
        },
        async function party() {
            return import('./browser.ts');
        },
    ],
    config: {
        default: {
            ui: {
                portal: {
                    portal: {title: 'Blong Party'},
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
            party: {},
        },
    },
}));
