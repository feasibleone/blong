import {createRequire} from 'node:module';

import {realm} from '../../types.js';

export default realm(blong => ({
    pkg: createRequire(import.meta.url)('../../package.json'),
    default: {
        tcp: false,
        http: false,
        server: true,
    },
    validation: blong.type.Object({}),
    url: import.meta.url,
    children: ['./server'],
}));
