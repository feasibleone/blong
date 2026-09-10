import {type IMeta, handler} from '@feasibleone/blong';

/**
 * @description Aggregator: collects messages until the batch size (3) is reached,
 * then stores the batch via mockDataStore and returns the result.
 * Returns undefined while still accumulating.
 */
type Handler = (message: unknown) => Promise<unknown>;

const BATCH_SIZE = 3;

export default handler(
    ({handler: {mockDataSave}}) => {
        const list: unknown[] = [];
        return async function eipMessageAggregate(
            message: Parameters<Handler>[0],
            $meta: IMeta,
        ): ReturnType<Handler> {
            list.push(message);
            if (list.length >= BATCH_SIZE) {
                const batch = list.splice(0, list.length);
                return mockDataSave({items: batch}, $meta);
            }
            return undefined;
        };
    },
);
