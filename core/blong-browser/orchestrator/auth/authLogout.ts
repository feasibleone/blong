import {type IMeta, handler} from '@feasibleone/blong';

export default handler(
    ({handler: {storageTokenDelete}}) =>
        async function authLogout(_params: object, $meta: IMeta): Promise<void> {
            await storageTokenDelete({}, $meta);
            const {useAppStore} = await import('../../src/state/appStore.js');
            useAppStore.getState().logout();
        },
);
