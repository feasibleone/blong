import {type IMeta, handler} from '@feasibleone/blong';

type Handler = (params: {a: number; b: number}) => Promise<number>;

export default handler(
    () =>
        async function cucumberCalculatorSubtract(
            params: Parameters<Handler>[0],
            $meta: IMeta,
        ): ReturnType<Handler> {
            return params.a - params.b;
        },
);
