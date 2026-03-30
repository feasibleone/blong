import {orchestrator} from '@feasibleone/blong';

export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: ['order'],
            imports: ['order.order'],
        },
    },
}));
