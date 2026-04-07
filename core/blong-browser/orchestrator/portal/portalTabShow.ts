import { type IMeta, handler } from '@feasibleone/blong';

export default handler(
    ({handler}) =>
        async function portalTabShow(
            {action, params: actionParams = {}}: {action: string; params?: Record<string, unknown>},
            $meta: IMeta,
        ): Promise<{action: string; title: string}> {
            const componentHandler = handler[action] as
                | ((p: object, m: IMeta) => Promise<{title?: string}>) | undefined;
            const meta = componentHandler
                ? await componentHandler(actionParams, {...$meta, method: action})
                : null;
            const title = meta?.title ?? action;

            const {useAppStore} = await import('../../src/state/appStore.js');
            useAppStore.getState().openTab({
                id: `${action}:${JSON.stringify(actionParams)}`,
                actionName: action,
                params: actionParams,
                title,
            });
            return {action, title};
        },
);
