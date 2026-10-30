import {handler, type IMeta} from '@feasibleone/blong';
import type {IChatInbound} from '@feasibleone/blong/types';

import {forwardTarget, type IChatDispatchPort} from '../settings.ts';

/**
 * `chat.in.message.receive` — hand the message to the consumer this realm was configured to deliver
 * to.
 *
 * The realm has no opinion about a message beyond what arrived, so it dispatches rather than decides:
 * the consumer is named per account by `chat.chatDispatch.forward`, and the port's activation maps
 * every account it does not name to `chat.in.message.ignore` (`@@D-687`).
 */
export default handler(() => ({
    async chatInMessageReceive(inbound: IChatInbound, $meta: IMeta): Promise<{handled: boolean}> {
        const port = this as unknown as IChatDispatchPort;
        await port.dispatch(inbound, {
            ...$meta,
            method: forwardTarget(port.config, inbound.account),
            mtid: 'request',
        });
        return {handled: true};
    },
}));
