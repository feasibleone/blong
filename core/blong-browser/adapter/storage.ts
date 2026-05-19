import {adapter} from '@feasibleone/blong';

export default adapter(() => ({
    extends: 'adapter.generic',
    activation: {
        default: {
            namespace: 'storage',
            imports: 'ui.storage',
        },
    },
}));
