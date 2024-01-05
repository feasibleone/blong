import {createRequire} from 'node:module';

import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    pkg: createRequire(import.meta.url)('./package.json'),
    url: import.meta.url,
    default: {},
    microservice: {},
    validation: blong.type.Object({}),
    children: ['./adapter'],
}));
