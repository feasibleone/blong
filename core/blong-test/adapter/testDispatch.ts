import {orchestrator} from '@feasibleone/blong';

export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    config: {
        default: {
            namespace: ['test'],
            imports: [/\.test$/],
        },
    },
}));
