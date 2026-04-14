import {adapter} from '@feasibleone/blong';

export default adapter(blong => ({
    extends: 'adapter.generic',
    activation: {
        default: {
            namespace: 'storage',
            imports: 'ui.storage',
        },
    },
}));
