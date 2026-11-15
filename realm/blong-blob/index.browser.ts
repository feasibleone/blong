import {browser} from '@feasibleone/blong';
import pkg from './package.json' with {type: 'json'};

/**
 * index.browser.ts — standalone browser bootstrap for `blob`.
 */
export default browser(blong => ({
    url: import.meta.url,
    pkg: {
        name: pkg.name,
        version: pkg.version,
    },
    validation: blong.type.Object({
        blob: blong.type.Object({}),
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
        async function blob() {
            return import('./browser.ts');
        },
    ],
    config: {
        default: {
            ui: {
                portal: {
                    portal: {
                        title: 'Blong Blob',
                    },
                },
            },
            blong: {},
            login: {},
            blob: {},
        },
        // The Test runs console ships only with the `test-ui` intent: the page
        // handler is always discovered, but a normal portal does not link it.
        'test-ui': {
            ui: {
                portal: {
                    portal: {
                        menu: [
                            {
                                id: 'test',
                                title: 'Test',
                                items: [
                                    {
                                        title: 'Test runs',
                                        method: 'blob.test.run',
                                        icon: 'pi pi-play',
                                    },
                                ],
                            },
                        ],
                    },
                },
            },
            blong: {},
            login: {},
            blob: {},
        } as never,
    },
}));
