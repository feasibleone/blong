/// <reference types="vite/client" />
/**
 * index.browser.ts — the marine demonstration app's browser entry point.
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
        async function login() {
            return import('@feasibleone/blong-login/browser.ts');
        },
        /**
         * The access realm's browser half: the `access.*` subject namespace, its
         * pages, and the self-service profile component the account menu opens.
         *
         * The suite mounts this realm, and this app is the same portal with a
         * different set of pages — a `portal.play.ts` capture taken here has to be
         * the picture the suite renders, or the realm's specs carry a baseline per
         * app while writing both to one file (`F-680`). One shell, two apps @@D-741.
         *
         * The server half is the same realm plus the mock child `index.ts` lists:
         * the framework adds `blong-access` because this manifest declares it, and
         * the mock's three adapter handlers shadow the reads the demo has no
         * database for.
         */
        async function access() {
            return import('@feasibleone/blong-access/browser.ts');
        },
        /** Marine biology realm (brings blong-browser infrastructure with it) */
        async function marine() {
            return import('./browser.ts');
        },
        /**
         * The framework realm: its `portalConfigGet` is the `Observe` menu group, and
         * its five `blong.*` pages are the items in it.
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
                        brand: {
                            logoUrl: `${assetBase}manta.png`,
                            orgTitle: 'Feasible One',
                            orgIcon: 'pi pi-building',
                        },
                    },
                },
            },
            login: {},
            marine: {},
            // A child realm loads only when the merged config names it (`if (config)`
            // in the loader's child loop), so an empty block is what loads the realm
            // at all — the same reason `blong-suite` spells them out.
            access: {},
            blong: {},
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
