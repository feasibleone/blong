import {createRequire} from 'node:module';

import {realm} from '../../types.js';

export default realm(fo => ({
    pkg: createRequire(import.meta.url)('../../package.json'),
    default: {
        adapter: true,
    },
    dev: {},
    microservice: {},
    integration: {},
    validation: fo.Type.Object({}),
    url: import.meta.url,
    children: ['./adapter'],
}));
