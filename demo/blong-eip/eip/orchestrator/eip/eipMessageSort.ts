import {type IMeta, handler} from '@feasibleone/blong';

/**
 * @description Resequencer: collects messages until the batch size (3) is reached,
 * sorts them by the order field, then processes each via mockItemProcess.
 * Returns undefined while still accumulating.
 */
type Handler = (params: {order: number; [key: string]: unknown}) => Promise<unknown[] | undefined>;

const BATCH_SIZE = 3;

export default handler(
    ({handler: {mockItemProcess}}) => {
        const list: Array<Parameters<Handler>[0]> = [];
        return async function eipMessageSort(
            params: Parameters<Handler>[0],
            $meta: IMeta,
        ): ReturnType<Handler> {
            list.push(params);
            if (list.length >= BATCH_SIZE) {
                const batch = list.splice(0, list.length);
                const sorted = batch.sort((a, b) => a.order - b.order);
                const results: unknown[] = [];
                for (const item of sorted) results.push(await mockItemProcess(item, $meta));
                return results;
            }
            return undefined;
        };
    },
);
