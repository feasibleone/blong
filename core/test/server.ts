import {server} from '@feasibleone/blong';

export default server(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: [
        async function login() {
            return import('@feasibleone/blong-login/server.ts');
        },
        async function openapi() {
            return import('@feasibleone/blong-openapi/server.ts');
        },
        './access',
        './ctp',
        './parking',
        './demo',
        // './db',
    ],
    config: {
        default: {},
        microservice: {},
        integration: {
            openapi: {},
        },
        dev: {
            access: {},
            parking: {},
            login: {
                login: {
                    methods: {
                        sessionCreate: false,
                        auditRecord: false,
                        sessionCleanup: false,
                    },
                },
            },
            demo: {},
            ctp: {},
        },
    },
}));
