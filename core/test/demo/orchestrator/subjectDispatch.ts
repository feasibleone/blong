import {orchestrator} from '@feasibleone/blong';

export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: ['subject', 'clock'],
            imports: ['demo.subject', 'demo.clock'],
            validations: ['demo.subject.validation'],
        },
    },
}));
