import {orchestrator} from '@feasibleone/blong';

export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    config: {
        default: {
            namespace: 'login',
            imports: ['login.login'],
            validations: ['login.login.validation'],
        },
    },
}));
