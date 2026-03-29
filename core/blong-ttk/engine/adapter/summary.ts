/**
 * Console summary output adapter
 */

import {adapter} from '@feasibleone/blong';

export default adapter(blong => ({
    extends: 'adapter.dispatch',
    activation: {
        default: {
            namespace: 'summary',
            imports: 'ttk.summary',
        },
    },
}));
