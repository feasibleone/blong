import {type IMeta, handler} from '@feasibleone/blong';

/** @description Message Filter: forwards the message only if the condition field is true */
type Handler = (params: {condition: boolean; [key: string]: unknown}) => Promise<unknown>;

export default handler(
    ({handler: {mockPipeA}}) =>
        async function eipMessageFilter(
            {condition, ...rest}: Parameters<Handler>[0],
            $meta: IMeta,
        ): ReturnType<Handler> {
            if (condition) return mockPipeA(rest, $meta);
            return undefined;
        },
);
