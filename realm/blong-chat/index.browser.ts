import {browser} from '@feasibleone/blong';
import pkg from './package.json' with {type: 'json'};

/**
 * index.browser.ts — standalone browser bootstrap for the `chat` realm.
 *
 * The portal has two pages: the chat workspaces and the accounts this deployment serves (`@@D-797`).
 * They are model pages, so the browse, new and open pages and their menu entries come from
 * `meta/model/chatWorkspaceModel.ts` and `meta/model/chatAccountModel.ts` rather than from components
 * written here, and `browser.ts` is what loads them.
 *
 * `access` is a child even though the realm owns no user of its own: the account menu's profile page
 * lives there, and a portal without it has no way to change a password or a language.
 */
export default browser(blong => ({
    url: import.meta.url,
    pkg: {
        name: pkg.name,
        version: pkg.version,
    },
    validation: blong.type.Object({
        chat: blong.type.Object({}),
        access: blong.type.Object({}),
        ui: blong.type.Object({}),
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
        async function access() {
            return import('@feasibleone/blong-access/browser.ts');
        },
        async function chat() {
            return import('./browser.ts');
        },
    ],
    config: {
        default: {
            ui: {
                portal: {
                    portal: {
                        title: 'Blong Chat',
                        // The self-service profile page, opened from the account menu.
                        profile: {
                            page: 'access.user.profile',
                            get: 'access.profile.get',
                        },
                    },
                },
            },
            blong: {},
            login: {},
            access: {},
            chat: {},
        },
    },
}));
