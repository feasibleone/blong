import {orchestrator} from '@feasibleone/blong';

export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: ['subject'],
            imports: ['demo.subject'],
            validations: ['demo.subject.validation'],
        },
    },
}));
