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
        /** core realm */
        async function core() {
            return import('@feasibleone/blong-core/server.ts');
        },
        /** Marine biology demonstration realm */
        async function marine() {
            return import('@feasibleone/blong-marine/server.ts');
        },
    ],
    config: {
        default: {
            srv: {
                'subject.validation': {
                    mock: {
                        marineCoralModel: true,
                        marineFamilyModel: true,
                        marineHabitatModel: true,
                        marineSpeciesModel: true,
                    },
                },
            },
        },
        dev: {
            srv: {},
            core: {},
            marine: {},
            login: {},
        },
    },
}));
