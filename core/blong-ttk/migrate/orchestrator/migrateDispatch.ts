/**
 * Migrate orchestrator dispatch - namespace: migrate
 */

import {orchestrator} from '@feasibleone/blong';

export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: 'migrate',
            imports: 'ttk.migrate',
        },
    },
}));
