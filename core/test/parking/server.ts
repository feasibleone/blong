import {createRequire} from 'node:module';

import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    pkg: createRequire(import.meta.url)('./package.json'),
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
    validation: blong.type.Object({}),
    url: import.meta.url,
    children: ['./orchestrator', './gateway', './test'],
}));
