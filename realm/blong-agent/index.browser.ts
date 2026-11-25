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
        async function agent() {
            return import('./browser.ts');
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
                    },
                },
            },
            blong: {},
            login: {},
            agent: {},
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
