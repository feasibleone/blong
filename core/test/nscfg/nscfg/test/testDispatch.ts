import {orchestrator} from '@feasibleone/blong';

export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    validation: blong.type.Object({
        namespace: blong.type.Optional(blong.type.Array(blong.type.String())),
        imports: blong.type.Optional(
            blong.type.Union([blong.type.String(), blong.type.Array(blong.type.String())]),
        ),
    }),
    activation: {
        default: {},
        integration: {
            namespace: ['test'],
            imports: ['nscfg.test'],
        },
    },
}));
