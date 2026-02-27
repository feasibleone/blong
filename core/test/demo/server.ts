import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./error', './adapter', './orchestrator', './gateway'],
    config: {
        default: {},
        microservice: {
            error: true,
            adapter: true,
            orchestrator: true,
            gateway: true,
        },
        integration: {},
    },
}));
