import {handler} from '@feasibleone/blong';

type Handler = (params: {a: number; b: number}) => Promise<number>;

export default handler(
    () =>
        async function cucumberCalculatorSubtract(
            params: Parameters<Handler>[0],
        ): ReturnType<Handler> {
            return params.a - params.b;
        },
);
