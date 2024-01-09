import {createRequire} from 'node:module';

import {realm} from '../../types.js';

export default realm(blong => ({
    pkg: createRequire(import.meta.url)('../../package.json'),
    default: {
        http: false,
        browser: true,
    },
    validation: blong.type.Object({}),
    url: import.meta.url,
    children: ['./browser'],
}));
