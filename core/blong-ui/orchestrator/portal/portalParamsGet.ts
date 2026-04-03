import { handler } from '@feasibleone/blong';

export default handler(
    () =>
        async function portalParamsGet(): Promise<{
            activeTabId: string | null;
            tabs: unknown[];
        }> {
            const {useAppStore} = await import('../../src/state/appStore.js');
            const state = useAppStore.getState();
            return {
                activeTabId: state.activeTabId,
                tabs: state.tabs,
            };
        },
);
