import {type IMeta, handler} from '@feasibleone/blong';

/**
 * @description Composer: calls handler A with part1 and handler B with part2 in parallel,
 * then merges the two results into a single response.
 */
type Handler = (params: {part1: unknown; part2: unknown}) => Promise<unknown>;

export default handler(
    ({handler: {mockPipeA, mockPipeB}}) =>
        async function eipMessageCompose(
            {part1, part2}: Parameters<Handler>[0],
            $meta: IMeta,
        ): ReturnType<Handler> {
            const [resultA, resultB] = await Promise.all([
                mockPipeA(part1, $meta),
                mockPipeB(part2, $meta),
            ]);
            return Object.assign({}, resultA, resultB);
        },
);
