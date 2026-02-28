import {orchestrator} from '@feasibleone/blong';

export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    validation: blong.type.Object({
        namespace: blong.type.String(),
        imports: blong.type.Array(blong.type.String()),
        validations: blong.type.Array(blong.type.String()),
    }),
    activation: {
        default: {
            namespace: 'login',
            imports: ['login.login'],
            validations: ['login.login.validation'],
        },
    },
}));
