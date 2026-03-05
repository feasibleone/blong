import {type IMeta, handler} from '@feasibleone/blong';

/** @description Dynamic Router: routes to a handler determined at runtime by the destination name */
type Handler = (params: {destination: string; [key: string]: unknown}) => Promise<unknown>;

export default handler(
    ({handler}) =>
        async function eipMessageDynamic(
            {destination, ...rest}: Parameters<Handler>[0],
            $meta: IMeta,
        ): ReturnType<Handler> {
            const target = (handler as Record<string, (...args: unknown[]) => unknown>)[destination];
            return target(rest, $meta);
        },
);
