import {orchestrator} from '@feasibleone/blong';

export default orchestrator(() => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {},
        integration: {
            namespace: ['test'],
            imports: ['mysql.test'],
        },
    },
}));
