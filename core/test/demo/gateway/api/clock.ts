import {api} from '@feasibleone/blong';

export default api(() => ({
    namespace: {
        clock: ['../../../api/world-time.yaml', '../../../api/world-time.operations.yaml'],
    },
}));
