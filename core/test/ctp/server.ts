import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./sim', './adapter', './gateway'],
    config: {
        default: {
            parking: {},
            ctp: {},
            demo: {},
        },
        test: {},
        microservice: {
            adapter: true,
            orchestrator: true,
            gateway: true,
        },
        integration: {
            sim: true,
        },
    },
}));
