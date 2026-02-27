import {orchestrator} from '@feasibleone/blong';

export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',

    validation: blong.type.Object({
        namespace: blong.type.Union([blong.type.String(), blong.type.Array(blong.type.String())]),
        imports: blong.type.Union([blong.type.String(), blong.type.Array(blong.type.String()), blong.type.Array(blong.type.RegExp())]),
        validations: blong.type.Optional(blong.type.Array(blong.type.Union([blong.type.String(), blong.type.RegExp()]))),
        destination: blong.type.Optional(blong.type.String()),
        logLevel: blong.type.Optional(blong.type.String()),
    }),

    config: {
        default: {
            destination: 'db',
            namespace: ['$subject'],
            imports: [/^$subject\./],
            validations: [/^$subject\.\w+\.validation$/],
        },
    },
}));
