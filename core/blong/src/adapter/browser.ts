import {createRequire} from 'node:module';

import {realm} from '../../types.js';

export default realm(blong => ({
    pkg: createRequire(import.meta.url)('../../package.json'),
    default: {
        tcp: false,
        http: false,
        dispatch: false,
        browser: true,
        common: true,
    },
    validation: blong.type.Object({}),
    url: import.meta.url,
    children: ['./common', './browser'],
}));
