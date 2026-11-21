import unchanged from '@feasibleone/blong';
import {browser} from '@feasibleone/blong';
import pkg from './package.json' with {type: 'json'};

/**
 * index.browser.ts — standalone browser bootstrap for `viewer`.
 */
export default browser(blong => ({
    url: import.meta.url,
    pkg: {
        name: pkg.name,
        version: pkg.version,
    },
    validation: blong.type.Object({
        viewer: blong.type.Object({}),
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
        async function viewer() {
            return import('./browser.ts');
        },
    ],
    config: {
        default: {
            ui: {
                portal: {
                    portal: {
                        title: 'Blong Logs',
                    },
                },
            },
            blong: {},
            login: {},
            viewer: {},
        },
    },
}));
