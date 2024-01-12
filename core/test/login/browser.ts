import {createRequire} from 'node:module';

import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    pkg: createRequire(import.meta.url)('./package.json'),
    default: {},
    dev: {},
    microservice: {},
    integration: {
        test: true,
    },
    validation: blong.type.Object({}),
    url: import.meta.url,
    children: ['./test'],
}));
