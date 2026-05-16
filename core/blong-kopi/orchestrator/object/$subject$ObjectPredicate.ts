import {handler} from '@feasibleone/blong';

type Handler = (params: {$objectId: string}) => Promise<{
    $objectId: string;
}>;

export default handler(
    () =>
        async function $subject$ObjectAdd(
            _params: Parameters<Handler>[0],
        ): ReturnType<Handler> {
            return {$objectId: '1'};
        },
);
