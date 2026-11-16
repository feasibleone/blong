/// <reference types="vite/client" />
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

/**
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
    validation: blong.type.Object({
        marine: blong.type.Object({}),
        blong: blong.type.Object({}),
        access: blong.type.Object({}),
        kustomize: blong.type.Object({}),
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
        /**
         * The access realm's browser half: the `access.*` subject namespace and the
         * self-service profile component the account menu opens.
         *
         * The server loads this realm through the framework loader, but the browser
         * does not, so a portal whose `profile.page` names `access.user.profile` needs
         * the child here or the name resolves to nothing.
         */
        async function access() {
            return import('@feasibleone/blong-access/browser.ts');
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
        /** Deployment realm: its Browse page over the suite's Deployments. */
        async function kustomize() {
            return import('@feasibleone/blong-kustomize/browser.ts');
        },
    ],
    config: {
        default: {
            ui: {
                portal: {
                    portal: {
                        title: 'Marine Biology',
                        // The suite's brand. One block feeds the login screen, the
                        // menubar mark and the portal's empty state — the manta is
                        // the blong mark (`img/manta200.png`), copied beside the
                        // entry so the bundle carries it.
                        brand: {
                            logoUrl: `${assetBase}manta.png`,
                            orgTitle: 'Feasible One',
                            orgIcon: 'pi pi-building',
                        },
                        // The self-service profile page, opened from the top-right
                        // account menu (`IPortalConfig.profile`): the component that
                        // draws it and the read the avatar comes from. Without the
                        // block the menu carries no "Profile" entry, and a
                        // deployment has no way to change a password or a language.
                        profile: {
                            page: 'access.user.profile',
                            get: 'access.profile.get',
                        },
                    },
                },
            },
            login: {},
            marine: {},
            blong: {},
            // A child realm loads only when the merged config names it (`if (config)`
            // in the loader's child loop), so an empty block is what loads the
            // realm at all. `access` carries the self-service profile page the
            // account menu opens; `kustomize` the Deployments page.
            access: {},
            kustomize: {},
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
