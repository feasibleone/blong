import {api} from '@feasibleone/blong';

export default api(() => ({
    namespace: {
        clock: ['../../../api/world-time.json', '../../../api/world-time.operations.json'],
    },
}));
