import {orchestrator} from '@feasibleone/blong';

export default orchestrator(() => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: ['subject'],
            imports: ['demo.subject'],
            validations: ['demo.subject.validation'],
        },
    },
}));
