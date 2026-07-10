import {server} from '@feasibleone/blong';
import pkg from './package.json' with {type: 'json'};

export default server(() => ({
    url: import.meta.url,
    pkg: {
        name: pkg.name,
        version: pkg.version,
    },
    children: [
        /** Built-in blong-server realm: RPC, validation orchestrator, DB adapter */
        async function srv() {
            return import('@feasibleone/blong-server/server.ts');
        },
        async function login() {
            return import('@feasibleone/blong-login/server.ts');
        },
        /** Core realm — provides core.resource and core.triple tables */
        async function core() {
            return import('@feasibleone/blong-core/server.ts');
        },
        /** Access realm — provides authZ tables used with core.triple hierarchy */
        async function access() {
            return import('@feasibleone/blong-access/server.ts');
        },
        /** Party management realm */
        async function party() {
            return import('./server.ts');
        },
    ],
    config: {
        default: {
            srv: {
                'subject.validation': {
                    mock: {
                        partyPersonModel: true,
                        partyOrganizationModel: true,
                        partyOrgUnitModel: true,
                    },
                },
            },
        },
        dev: {
            gateway: {
                debug: true,
                expectedErrors: true,
            },
            systemDebug: {enabled: true},
            srv: {},
            core: {},
            access: {},
            party: {},
            login: {},
        },
    },
}));
