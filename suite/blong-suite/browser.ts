/**
 * browser.ts — blong-suite browser entry point.
 *
 * Each realm listed in `children` is self-contained — it brings its own
 * infrastructure (blong-browser, blong-server, etc.). The runtime
 * deduplicates shared infrastructure by URL.
 *
 * To add another realm:
 *   1. Add its package to dependencies in package.json.
 *   2. Append `async function <name>() { return import('<pkg>/browser.ts'); }`
 *      to the children array.
 *   3. Add a config key for the realm if needed.
 */
import {browser} from '@feasibleone/blong';
import pkg from './package.json' with {type: 'json'};

export default browser(blong => ({
    url: import.meta.url,
    pkg: {
        name: pkg.name,
        version: pkg.version,
    },
    validation: blong.type.Object({
        marine: blong.type.Object({}),
        blong: blong.type.Object({}),
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
        /** Marine biology realm (brings blong-browser infrastructure with it) */
        async function marine() {
            return import('@feasibleone/blong-marine/browser.ts');
        },
        /**
         * The framework realm: what has been observed, what the service has
         * learned, what changed, and what broke — the five `blong.*` pages.
         */
        async function blong() {
            return import('@feasibleone/blong-realm/browser.ts');
        },
    ],
    config: {
        default: {
            ui: {
                portal: {
                    portal: {
                        title: 'Blong Suite',
                    },
                },
            },
            login: {},
            marine: {},
            blong: {},
        },
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
