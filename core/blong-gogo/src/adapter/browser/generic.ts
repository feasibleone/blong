import {adapter} from '@feasibleone/blong/types';

export default adapter(() => {
    return {
        activation: {
            default: {
                type: 'generic',
            },
        },
    };
});
