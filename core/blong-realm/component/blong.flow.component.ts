import {handler} from '@feasibleone/blong';

export default handler(() => ({
    'blong.flow.browse': async () => ({
        title: 'Flow',
        permission: 'blong.flow.find',
        component: async () => (await import('../pages/Flow.js')).Flow,
    }),
}));
