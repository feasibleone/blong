import {browser} from '@feasibleone/blong';
import pkg from './package.json' with {type: 'json'};

/**
 * index.browser.ts — standalone browser bootstrap for `$subject`.
 */
export default browser(blong => ({
    url: import.meta.url,
    pkg: {
        name: pkg.name,
        version: pkg.version,
    },
    validation: blong.type.Object({
        $subject: blong.type.Object({}),
    }),
    children: [
        async function ui() {
            return import('@feasibleone/blong-browser/browser.ts');
        },
        async function $subject() {
            return import('./browser.ts');
        },
    ],
    config: {
        default: {
            ui: {
                portal: {
                    portal: {
                        title: 'Blong $Subject',
                    },
                },
            },
            $subject: {},
        },
    },
}));
