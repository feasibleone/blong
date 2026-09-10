import {server} from '@feasibleone/blong';
import pkg from './package.json' with {type: 'json'};

export default server(() => ({
    url: import.meta.url,
    pkg: {
        name: pkg.name,
        version: pkg.version,
    },
    children: [
        async function access() {
            return import('./server.ts');
        },
    ],
    config: {
        default: {},
        dev: {
            login: {
                login: {
                    methods: {
                        sessionCreate: false,
                        auditRecord: false,
                        sessionCleanup: false,
                    },
                },
            },
        },
    },
}));
