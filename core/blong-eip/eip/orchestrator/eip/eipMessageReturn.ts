import {type IMeta, handler} from '@feasibleone/blong';

/** @description Request-Reply: returns the given result unchanged */
type Handler = (params: {result: unknown}) => Promise<unknown>;

export default handler(
    () =>
        async function eipMessageReturn(
            params: Parameters<Handler>[0],
            _$meta: IMeta,
        ): ReturnType<Handler> {
            return params.result;
        },
);
