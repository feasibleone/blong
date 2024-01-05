import {createRequire} from 'node:module';

import {realm} from '@feasibleone/blong';

export default realm(fo => ({
    pkg: createRequire(import.meta.url)('./package.json'),
    url: import.meta.url,
    default: {},
    microservice: {},
    validation: fo.Type.Object({}),
    children: ['./adapter'],
}));
