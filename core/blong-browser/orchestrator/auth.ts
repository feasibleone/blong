import {orchestrator} from '@feasibleone/blong';

export default orchestrator(() => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: 'auth',
            imports: 'ui.auth',
        },
    },
}));
