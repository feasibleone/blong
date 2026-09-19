import {handler} from '@feasibleone/blong';

export default handler(() => ({
    'blong.digest.browse': async () => ({
        title: 'Digest',
        permission: 'blong.digest.get',
        component: async () => (await import('../pages/Digest.js')).Digest,
    }),
}));
