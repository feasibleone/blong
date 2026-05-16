import {type IMeta, handler} from '@feasibleone/blong';

/**
 * Handles idle send events by dispatching an echo request.
 * This triggers the echo keepalive cycle over the TCP connection.
 */
export default handler(
    () =>
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
        },
);
