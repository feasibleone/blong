import {type IMeta, handler} from '@feasibleone/blong';

/** @description Pipes and Filters: passes message through handler A then handler B in sequence */
type Handler = (params: unknown) => Promise<unknown>;

export default handler(
    ({handler: {mockPipeA, mockPipeB}}) =>
        async function eipMessagePipes(
            params: Parameters<Handler>[0],
            $meta: IMeta,
        ): ReturnType<Handler> {
            const resultA = await mockPipeA(params, $meta);
            return mockPipeB(resultA, $meta);
        },
);
