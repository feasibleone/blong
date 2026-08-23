import {browser} from '@feasibleone/blong';
import pkg from './package.json' with {type: 'json'};

/**
 * index.browser.ts — standalone browser bootstrap for blong-commander.
 */
export default browser(blong => ({
    url: import.meta.url,
    pkg: {
        name: pkg.name,
        version: pkg.version,
    },
    validation: blong.type.Object({
        commander: blong.type.Object({
            showParentRow: blong.type.Boolean({default: true}),
        }),
    }),
    children: [
        async function ui() {
            return import('@feasibleone/blong-browser/browser.ts');
        },
        async function login() {
            return import('@feasibleone/blong-login/browser.ts');
        },
        async function commander() {
            return import('./browser.ts');
        },
    ],
    config: {
        default: {
            ui: {
                portal: {
                    portal: {
                        title: 'Blong Commander',
                        menu: [
                            {
                                title: 'Explore',
                                items: [
                                    {
                                        title: 'Commander',
                                        method: 'commander.browse',
                                        icon: 'pi pi-sitemap',
                                    },
                                ],
                            },
                        ],
                    },
                },
            },
            login: {},
            commander: {
                // UI options for the Commander shell:
                // showParentRow — show the ".." up-to-parent row in the right table.
                showParentRow: true,
            },
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
