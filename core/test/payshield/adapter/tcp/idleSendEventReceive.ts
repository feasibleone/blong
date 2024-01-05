import {IMeta, handler} from '@feasibleone/blong';

export default handler(
    proxy =>
        function idleSendEventReceive(params: unknown, $meta: IMeta) {
            $meta.dispatch = () => [
                {},
                {
                    ...$meta,
                    mtid: 'request',
                    echo: true,
                    method: 'echo',
                    timer: $meta.timer,
                    dispatch: () => false,
                },
            ];
        }
);
