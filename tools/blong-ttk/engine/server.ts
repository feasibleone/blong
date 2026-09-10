/**
 * Engine realm - Test collection execution engine
 */

import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: [
        './orchestrator/engineDispatch',
        './adapter/summary',
    ],
    config: {
        default: {},
        microservice: {
            adapter: true,
            orchestrator: true,
        },
    },
}));
