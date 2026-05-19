/**
 * Console summary output adapter
 */

import {adapter} from '@feasibleone/blong';

export default adapter(_blong => ({
    extends: 'adapter.dispatch',
    activation: {
        default: {
            namespace: 'summary',
            imports: 'ttk.summary',
        },
    },
}));
