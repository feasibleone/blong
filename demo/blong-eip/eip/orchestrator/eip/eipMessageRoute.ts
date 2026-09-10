import {type IMeta, handler} from '@feasibleone/blong';

/** @description Content Based Router: routes to handler A or B based on the destination field */
type Handler = (params: {destination: string; [key: string]: unknown}) => Promise<unknown>;

export default handler(
    ({handler: {mockPipeA, mockPipeB}}) =>
        async function eipMessageRoute(
            {destination, ...rest}: Parameters<Handler>[0],
            $meta: IMeta,
        ): ReturnType<Handler> {
            if (destination === 'A') return mockPipeA(rest, $meta);
            return mockPipeB(rest, $meta);
        },
);
