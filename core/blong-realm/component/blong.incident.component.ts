import {handler} from '@feasibleone/blong';

export default handler(() => ({
    'blong.incident.browse': async () => ({
        title: 'Incident',
        permission: 'blong.incident.find',
        component: async () => (await import('../pages/Incident.js')).Incident,
    }),
}));
