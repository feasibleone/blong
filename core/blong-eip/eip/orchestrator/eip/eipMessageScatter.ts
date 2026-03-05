import {type IMeta, handler} from '@feasibleone/blong';

/**
 * @description Scatter Gatherer: sends the message to each handler named in the destinations array,
 * then collects and returns all results.
 */
type Handler = (params: {destinations: string[]; [key: string]: unknown}) => Promise<unknown[]>;

export default handler(
    ({handler}) =>
        async function eipMessageScatter(
            {destinations, ...rest}: Parameters<Handler>[0],
            $meta: IMeta,
        ): ReturnType<Handler> {
            const handlerMap = handler as Record<string, (...args: unknown[]) => unknown>;
            return Promise.all(destinations.map(dest => handlerMap[dest](rest, $meta)));
        },
);
