/// <reference types="vite/client" />
import {browser} from '@feasibleone/blong';
import pkg from './package.json' with {type: 'json'};

/**
 * index.browser.ts — standalone browser bootstrap for `sport`.
 *
 * Where this build keeps its static files (`public/` → the bundle root). The
 * prefix is `/s/` in an app build and `/` in Storybook, so the brand logo is
 * named from it rather than from a path that only one of the two serves.
 */
const assetBase = import.meta.env?.BASE_URL ?? './';

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
        access: blong.type.Object({}),
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
        /**
         * The access realm's browser half: the `access.*` subject namespace and the
         * self-service profile component the account menu opens.
         *
         * The server loads this realm from the framework loader, but the browser does
         * not — a portal whose `profile.page` names `access.user.profile` without this
         * child resolves the name to nothing and the menu entry opens an empty tab.
         */
        async function access() {
            return import('@feasibleone/blong-access/browser.ts');
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
                        title: 'National Olympic Register',
                        // The suite's brand. The login screen, the menubar and the
                        // portal's empty state all read this block, so one entry here
                        // is what turns the default globe-and-"Blong Portal" into
                        // something a deployment belongs to.
                        brand: {
                            logoUrl: `${assetBase}sport-logo.svg`,
                            orgTitle: 'Bulgarian Olympic Committee',
                            orgIcon: 'pi pi-building',
                        },
                        // The self-service profile page, opened from the top-right
                        // account menu. `page` is the component method, `get` the read the
                        // avatar is drawn from; without the block the menu has no "Profile"
                        // entry at all, which is what left a deployment with no way to
                        // change a password or a language.
                        profile: {
                            page: 'access.user.profile',
                            get: 'access.profile.get',
                        },
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
                            // Dictation in a callout (`@@D-758`): the browser's
                            // own recogniser, so nothing is bundled and nothing
                            // is downloaded. `language` is left out on purpose —
                            // the engine follows the browser's locale, and the
                            // Bulgarian dictionary this suite ships is not the
                            // same thing as the person's microphone language.
                            speech: {engine: 'webSpeech'},
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
            // Empty, and not optional: the loader skips a child whose name the
            // merged config does not carry, so `access: {}` is what makes the
            // realm load at all (the account menu's profile page lives in it).
            access: {},
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
