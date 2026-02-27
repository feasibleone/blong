import {orchestrator} from '@feasibleone/blong';

export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    config: {
        dev: {
            namespace: 'parking',
            imports: 'parking.parking',
        },
    },
}));
