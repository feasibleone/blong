import {type IMeta, handler} from '@feasibleone/blong';

/**
 * @description Content Filter: removes unwanted fields (skip) from the message
 * before forwarding the simplified message to mockItemProcess.
 */
type Handler = (params: {skip?: unknown; [key: string]: unknown}) => Promise<unknown>;

export default handler(
    ({handler: {mockItemProcess}}) =>
        async function eipMessageSimplify(
            {skip: _skip, ...rest}: Parameters<Handler>[0],
            $meta: IMeta,
        ): ReturnType<Handler> {
            return mockItemProcess(rest, $meta);
        },
);
