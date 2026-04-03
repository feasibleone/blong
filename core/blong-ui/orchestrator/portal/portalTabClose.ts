import { handler } from '@feasibleone/blong';

export default handler(
    () =>
        async function portalTabClose({tabId}: {tabId: string}): Promise<string> {
            const {useAppStore} = await import('../../src/state/appStore.js');
            useAppStore.getState().closeTab(tabId);
            return tabId;
        },
);
