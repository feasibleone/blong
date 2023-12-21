import { handler } from '@feasibleone/blong';

export default handler(proxy => function idleSendEventReceive(params, $meta) {
    $meta.dispatch = () => [{}, {
        ...$meta,
        mtid: 'request',
        echo: true,
        method: 'echo',
        timer: $meta.timer,
        dispatch: () => false
    }];
});
