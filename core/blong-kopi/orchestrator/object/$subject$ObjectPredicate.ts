import {IMeta, handler} from '@feasibleone/blong';

type Handler = (params: {}) => Promise<{
    $objectId: string;
}>;

export default handler(
    () =>
        async function $subject$ObjectAdd(
            params: Parameters<Handler>[0],
            $meta: IMeta
        ): ReturnType<Handler> {
            return {$objectId: '1'};
        }
);
