import {IMeta, handler} from '@feasibleone/blong';

type Handler = (params: number[]) => Promise<number>;

export default handler(
    ({lib: {sum}}) =>
        async function subjectNumberSum(
            params: Parameters<Handler>[0],
            $meta: IMeta
        ): ReturnType<Handler> {
            return sum(params);
        }
);
