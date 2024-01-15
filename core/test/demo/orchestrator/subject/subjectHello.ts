import {IMeta, handler} from '@feasibleone/blong';

type Handler = (params: unknown) => Promise<{
    hello: unknown;
}>;

export default handler(
    proxy =>
        async function subjectHello(
            params: Parameters<Handler>[0],
            $meta: IMeta
        ): ReturnType<Handler> {
            return {hello: $meta.auth};
        }
);
