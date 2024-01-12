import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./orchestrator', './gateway', './test'],
    default: {},
    dev: {
        dispatch: {
            namespace: 'parking',
            imports: 'parking.parking',
        },
    },
    microservice: {
        adapter: true,
        orchestrator: true,
        gateway: true,
    },
    integration: {
        test: true,
    },
}));
