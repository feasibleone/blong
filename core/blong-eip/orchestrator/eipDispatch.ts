import {orchestrator} from '@feasibleone/blong';
import type {Config} from '@feasibleone/blong';

type Activation = Partial<Config<{namespace: string[]; imports: string | string[]}>>;

export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    validation: blong.type.Object({
        namespace: blong.type.Array(blong.type.String()),
        imports: blong.type.Union([
            blong.type.String(),
            blong.type.Array(blong.type.String()),
        ]),
    }),
    activation: {
        default: {
            namespace: ['eip'],
            imports: 'eip.eip',
        } as Activation,
        integration: {
            namespace: ['eip', 'mock'],
            imports: ['eip.eip', 'eip.sim'],
        } as Activation,
    },
}));
