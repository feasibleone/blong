import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        openapi: blong.type.Object({}),
    }),
    children: ['./orchestrator'],
    config: {
        default: {
            openapi: {
                logLevel: 'trace',
            },
        },
        dev: {},
        microservice: {
            orchestrator: true,
            gateway: {
                port: 8081,
            },
        },
        integration: {},
    },
}));
