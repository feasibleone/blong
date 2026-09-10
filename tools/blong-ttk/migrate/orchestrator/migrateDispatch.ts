/**
 * Migrate orchestrator dispatch - namespace: migrate
 */

import {orchestrator} from '@feasibleone/blong';

export default orchestrator(_blong => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: 'migrate',
            imports: 'ttk.migrate',
        },
    },
}));
