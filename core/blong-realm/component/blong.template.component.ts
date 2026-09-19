import {handler} from '@feasibleone/blong';

export default handler(() => ({
    'blong.template.browse': async () => ({
        title: 'Template',
        permission: 'blong.template.find',
        component: async () => (await import('../pages/Template.js')).Template,
    }),
}));
