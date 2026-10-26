import {browser} from '@feasibleone/blong';
import pkg from './package.json' with {type: 'json'};

/**
 * index.browser.ts — standalone browser bootstrap for `sport`.
 */
export default browser(blong => ({
    url: import.meta.url,
    pkg: {
        name: pkg.name,
        version: pkg.version,
    },
    validation: blong.type.Object({
        sport: blong.type.Object({}),
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
        async function party() {
            return import('@feasibleone/blong-party/browser.ts');
        },
        /** Translation tables and their editor pages */
        async function core() {
            return import('@feasibleone/blong-core/browser.ts');
        },
        async function gateway() {
            return import('@feasibleone/blong-gateway/browser.ts');
        },
        async function sport() {
            return import('./browser.ts');
        },
    ],
    config: {
        default: {
            ui: {
                portal: {
                    portal: {
                        title: 'Blong Sport',
                        // Where the database half of the dictionary comes from.
                        // `blong-browser` reads these names from the merged portal
                        // config, so it needs no dependency on core (`D-630`).
                        translation: {
                            load: {
                                label: 'core.label.list',
                            },
                        },
                    },
                },
            },
            blong: {},
            login: {},
            party: {},
            core: {},
            gateway: {},
            sport: {},
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
                                        method: 'sport.test.run',
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
            sport: {},
        } as never,
    },
}));
