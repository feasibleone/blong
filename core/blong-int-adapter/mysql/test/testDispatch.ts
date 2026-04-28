import {orchestrator} from '@feasibleone/blong';

export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {},
        'adapter.mysql': {
            namespace: ['test'],
            imports: ['mysql.test'],
        },
    },
}));
