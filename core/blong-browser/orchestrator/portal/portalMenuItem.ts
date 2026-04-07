import {type IMeta, handler} from '@feasibleone/blong';

export default handler(
    ({handler}) =>
        async function portalMenuItem(
            {action}: {action: string},
            $meta: IMeta,
        ): Promise<{title?: string; permission?: string; icon?: string} | null> {
            const componentHandler = handler[action] as
                | ((
                      p: object,
                      m: IMeta,
                  ) => Promise<{title?: string; permission?: string; icon?: string}>)
                | undefined;
            if (!componentHandler) return null;
            return componentHandler({}, {...$meta, method: action});
        },
);
