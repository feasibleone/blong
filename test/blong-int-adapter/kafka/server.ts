import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./test'],
    config: {
        default: {},
        microservice: {
            adapter: true,
        },
        'adapter.kafka': {
            adapter: true,
            orchestrator: true,
            test: true,
        },
    },
}));
