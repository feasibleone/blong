import { createRequire } from 'node:module';

import { realm } from '@feasibleone/blong';

export default realm(fo => ({
    pkg: createRequire(import.meta.url)('./package.json'),
    default: {
    },
    microservice: {},
    validation: fo.Type.Object({}),
    url: import.meta.url,
    children: ['./adapter']
}));
