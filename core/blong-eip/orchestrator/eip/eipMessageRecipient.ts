import {type IMeta, handler} from '@feasibleone/blong';

/**
 * @description Recipient List: sends the message to handler A and handler B.
 * Use sequential=true for sequential execution, otherwise runs in parallel.
 */
type Handler = (params: {
    sequential?: boolean;
    [key: string]: unknown;
}) => Promise<unknown[]>;

export default handler(
    ({handler: {mockPipeA, mockPipeB}}) =>
        async function eipMessageRecipient(
            {sequential, ...rest}: Parameters<Handler>[0],
            $meta: IMeta,
        ): ReturnType<Handler> {
            if (sequential) {
                const resultA = await mockPipeA(rest, $meta);
                const resultB = await mockPipeB(rest, $meta);
                return [resultA, resultB];
            }
            return Promise.all([mockPipeA(rest, $meta), mockPipeB(rest, $meta)]);
        },
);
