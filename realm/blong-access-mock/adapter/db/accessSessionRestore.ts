import {handler} from '@feasibleone/blong';

export default handler(() => ({
    async accessSessionRestore() {
        return {valid: false, reason: 'notFound'};
    },
}));
