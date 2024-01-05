import {createRequire} from 'node:module';

import {realm} from '../../types.js';

export default realm(blong => ({
    pkg: createRequire(import.meta.url)('../../package.json'),
    default: {
        adapter: true,
    },
    dev: {},
    microservice: {},
    integration: {
        test: true,
    },
    validation: blong.type.Object({}),
    url: import.meta.url,
    children: ['./adapter', './test'],
}));
