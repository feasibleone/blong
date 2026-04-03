import { adapter } from '@feasibleone/blong';

export default adapter(blong => ({
    extends: 'adapter.dispatch',
    activation: {
        default: {
            namespace: 'storage',
            imports: 'ui.storage',
        },
    },
}));
