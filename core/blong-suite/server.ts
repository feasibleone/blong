import {server} from '@feasibleone/blong';
import pkg from './package.json' with {type: 'json'};

export default server(() => ({
    url: import.meta.url,
    pkg: {
        name: pkg.name,
        version: pkg.version,
    },
    children: [
        /** Built-in blong-browser realm: RPC, auth, portal, auth orchestrators */
        async function srv() {
            return import('@feasibleone/blong-server/server.ts');
        },
        async function login() {
            return import('@feasibleone/blong-login/server.ts');
        },
        async function core() {
            return import('@feasibleone/blong-core/server.ts');
        },
        async function access() {
            return import('@feasibleone/blong-access/server.ts');
        },
        /** Marine biology demonstration realm */
        async function marine() {
            return import('@feasibleone/blong-marine/server.ts');
        },
    ],
    config: {
        default: {},
        dev: {
            srv: {
                db: {
                    // logLevel: 'debug',
                },
            },
            core: {},
            access: {},
            marine: {},
            login: {},
        },
    },
}));
