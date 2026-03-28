/**
 * Sample orchestrator — dispatches sample CRUD operations.
 */

import {orchestrator} from '@feasibleone/blong';

export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: 'sample',
            imports: 'sample.item',
        },
    },
}));
