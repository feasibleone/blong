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
    /**
     * The namespaces this entry configures.
     *
     * `ui` is here because the `integration` block below reaches into it: a
     * config block's keys are checked against this schema, and a namespace that is
     * only ever named as a child was typed as an unknown property (`@@F-634`).
     */
    validation: blong.type.Object({
        sport: blong.type.Object({}),
        ui: blong.type.Object({}),
        feedback: blong.type.Object({}),
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
        /**
         * Feedback capture and its review page.
         *
         * The browser half is generic — the toggle, the callouts and the document
         * live in `blong-browser` — and the method names below are what point it at
         * this realm (`@@D-662`).
         */
        async function feedback() {
            return import('@feasibleone/blong-feedback/browser.ts');
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
                        // Feedback mode: the toggle appears in the menubar, and the
                        // methods it and the review page call are named here so
                        // `blong-browser` stays free of the feedback package
                        // (`@@D-662`).
                        feedback: {
                            enabled: true,
                            submit: 'feedback.session.add',
                            permission: 'feedback.session.add',
                            find: 'feedback.session.find',
                            get: 'feedback.session.get',
                            shot: 'feedback.shot.get',
                            prose: 'feedback.prose.render',
                            update: 'feedback.session.update',
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
            feedback: {},
        },
        // TEST-ONLY: the `integration` intent (active in a browser run) exposes the
        // wrapped handler as `window.__blongHandler` and the store as
        // `window.__blongStore`, which a Playwright spec reads to see the state the
        // pages do not print. A deployment runs `release`, never `integration`.
        integration: {
            ui: {
                portal: {
                    portal: {
                        testHook: true,
                    },
                },
            },
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
