import {IMeta, handler} from '@feasibleone/blong';

type Handler = (params: unknown) => Promise<{
    abbreviation: string;
}>;

export default handler(
    ({handler: {timeGet}}) =>
        async function subjectTime(
            params: Parameters<Handler>[0],
            $meta: IMeta
        ): ReturnType<Handler> {
            return timeGet(params, $meta);
        }
);
