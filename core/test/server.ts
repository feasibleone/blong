import {createRequire} from 'node:module';

import {server} from '@feasibleone/blong';

export default server(fo => ({
    pkg: createRequire(import.meta.url)('./package.json'),
    url: import.meta.url,
    default: {},
    microservice: {},
    dev: {
        resolution: true,
    },
    validation: fo.Type.Object({}),
    children: [
        function ctp() {
            return import('./ctp/server.js');
        },
        function parking() {
            return import('./parking/server.js');
        },
        function payshield() {
            return import('./payshield/server.js');
        },
        function demo() {
            return import('./demo/server.js');
        },
        function db() {
            return import('./db/server.js');
        },
    ],
}));
