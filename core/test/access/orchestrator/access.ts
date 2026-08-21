import {handler} from '@feasibleone/blong';

export default handler(() => ({
    accessCredentialCheck() {
        return {
            userId: '01',
            permissionMap: '',
            actions: ['accessLogin'],
        };
    },
}));
