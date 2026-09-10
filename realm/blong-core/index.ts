import {server} from '@feasibleone/blong';
import pkg from './package.json' with {type: 'json'};

export default server(() => ({
    url: import.meta.url,
    pkg: {
        name: pkg.name,
        version: pkg.version,
    },
    children: [
        /** Built-in blong-server realm: RPC, auth, portal, auth orchestrators */
        async function srv() {
            return import('@feasibleone/blong-server/server.ts');
        },
        async function login() {
            return import('@feasibleone/blong-login/server.ts');
        },
        /** Core utility realm: shared schema objects */
        async function core() {
            return import('./server.ts');
        },
    ],
    config: {
        default: {
            srv: {},
        },
        dev: {
            srv: {},
            core: {},
            login: {},
        },
    },
}));
