import {handler} from '@feasibleone/blong';

export default handler(() => ({
    'blong.search.browse': async () => ({
        title: 'Search',
        permission: 'blong.search.find',
        component: async () => (await import('../pages/Search.js')).Search,
    }),
}));
