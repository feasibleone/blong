/**
 * Sample realm — demonstrates CRUD for a sample entity.
 */

import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./orchestrator', './gateway'],
    config: {
        default: {},
    },
}));
