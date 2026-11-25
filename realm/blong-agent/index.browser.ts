import {browser} from '@feasibleone/blong';

import pkg from './package.json' with {type: 'json'};

/**
 * index.browser.ts — standalone browser bootstrap for `agent` (`@@T-796`).
 *
 * The suite a developer opens with `blong ./browser.ts dev`, and the one a Playwright run drives:
 * the framework's browser platform, the login page, the portal shell, and this realm's own page. The
 * portal title is the deployment's, so a realm that is hosted in another suite keeps its own name
 * there.
 */
export default browser(blong => ({
    url: import.meta.url,
    pkg: {
        name: pkg.name,
        version: pkg.version,
    },
    validation: blong.type.Object({
        agent: blong.type.Object({}),
        access: blong.type.Object({}),
        chat: blong.type.Object({}),
        viewer: blong.type.Object({}),
        ui: blong.type.Object({}),
    }),
    children: [
        async function blong() {
            return import('@feasibleone/blong-realm/browser.ts');
        },
        async function ui() {
            return import('@feasibleone/blong-browser/browser.ts');
        },
        async function login() {
            return import('@feasibleone/blong-login/browser.ts');
        },
        /**
         * The account menu's own pages, which this realm does not own.
         *
         * `access` is a child even though the agent owns no user of its own: the profile page and
         * the password form live there, and a portal without it has no way to change either — the
         * chat deployment named it for this reason and the agent inherits the deployment.
         */
        async function access() {
            return import('@feasibleone/blong-access/browser.ts');
        },
        async function agent() {
            return import('./browser.ts');
        },
        /**
         * The workspaces and the accounts this deployment serves.
         *
         * They are the chat realm's model pages, and they stay in the portal because the account
         * store does: an account added there is what the next maintenance pass serves to Slack, so
         * a deployment that kept the store and dropped the page would leave it writable only by a
         * call.
         */
        async function chat() {
            return import('@feasibleone/blong-chat/browser.ts');
        },
        /**
         * The records this deployment's own processes wrote: Observability → Logs.
         *
         * The page reads `viewer.entry.*` from the gateway that served it, and the capability
         * that opens it is seeded by the deployment's migration (`@@D-946`).
         */
        async function viewer() {
            return import('@feasibleone/blong-viewer/browser.ts');
        },
        // The test realm's browser half: it is what binds `test.*` in the page, which the spec needs
        // to start the seeding run, and what routes the page's calls to the server over HTTP.
        async function testClient() {
            return import('@feasibleone/blong-test/browser.ts');
        },
    ],
    config: {
        default: {
            ui: {
                portal: {
                    portal: {
                        title: 'Blong Agent',
                        // The self-service profile page, opened from the account menu.
                        profile: {
                            page: 'access.user.profile',
                            get: 'access.profile.get',
                        },
                    },
                },
            },
            blong: {},
            login: {},
            access: {},
            agent: {},
            chat: {},
            // A child realm loads only when the merged config names it, so an empty block is what
            // loads the realm at all: `viewer` is the Logs page over this deployment's own records.
            viewer: {},
        },
        // TEST-ONLY: the `integration` intent (active in a browser run) exposes the wrapped handler
        // as `window.__blongHandler`, which the spec reads to start the seeding group — the one
        // surface a deployment must never have, so it is a test intent's block and not the default.
        integration: {
            ui: {
                portal: {
                    portal: {
                        testHook: true,
                    },
                },
            },
            // The page's own origin, not a host and a port: the dev server proxies `/rpc` to the
            // backend the runner chose, so a CI run on a derived port needs no configuration here.
            testClient: {
                backend: {
                    namespace: ['agent', 'test'],
                    url: globalThis.location?.origin ?? 'http://localhost:8080',
                },
            },
        } as never,
    },
}));
