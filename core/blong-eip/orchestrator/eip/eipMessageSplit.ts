import {type IMeta, handler} from '@feasibleone/blong';

/**
 * @description Splitter: breaks a message into individual items and processes each via mockItemProcess.
 * Use sequential=true for sequential execution, otherwise runs in parallel.
 */
type Handler = (params: {
    items: unknown[];
    sequential?: boolean;
}) => Promise<unknown[]>;

export default handler(
    ({handler: {mockItemProcess}}) =>
        async function eipMessageSplit(
            {items, sequential}: Parameters<Handler>[0],
            $meta: IMeta,
        ): ReturnType<Handler> {
            if (sequential) {
                const results: unknown[] = [];
                for (const item of items) results.push(await mockItemProcess(item, $meta));
                return results;
            }
            return Promise.all(items.map(item => mockItemProcess(item, $meta)));
        },
);
