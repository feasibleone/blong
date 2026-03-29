/**
 * Engine orchestrator dispatch - namespace: engine
 */

import {orchestrator} from '@feasibleone/blong';

export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: 'engine',
            imports: 'ttk.engine',
        },
    },
}));
