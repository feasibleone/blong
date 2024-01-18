import {api} from '@feasibleone/blong';

export default api(() => ({
    namespace: {
        clock: ['core/test/api/world-time.json', 'core/test/api/world-time.operations.json'],
    },
}));
