/**
 * Callback orchestrator dispatch - namespace: callback
 */

import {orchestrator} from '@feasibleone/blong';

export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: 'callback',
            imports: 'ttk.callback',
        },
    },
}));
