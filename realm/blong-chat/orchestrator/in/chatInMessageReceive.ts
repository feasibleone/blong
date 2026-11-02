import {handler, type IMeta} from '@feasibleone/blong';
import type {IChatChannel, IChatInbound} from '@feasibleone/blong/types';

import {channelOf, forwardTarget, type IChatDispatchPort} from '../settings.ts';

/**
 * `chat.in.message.receive` — hand the message to the consumer this realm was configured to deliver
 * to.
 *
 * The realm has no opinion about a message beyond what arrived, so it dispatches rather than decides:
 * the consumer is named per account by `chat.chatDispatch.forward`, and the port's activation maps
 * every account it does not name to `chat.in.message.ignore` (`@@D-687`).
 *
 * When the deployment keeps conversations (`channelStore: 'db'`) the row for this address is looked up
 * first and the message carries it, because the consumer's decision depends on the channel it has
 * already made rather than on the message alone. A channel that names its own consumer wins over the
 * account map: the conversation has already answered that question once (`@@D-725`). A conversation
 * nobody has seen is forwarded without a channel, which is exactly the case a consumer opens its
 * onboarding on.
 */
export default handler(() => ({
    async chatInMessageReceive(inbound: IChatInbound, $meta: IMeta): Promise<{handled: boolean}> {
        const port = this as unknown as IChatDispatchPort;
        const settings = port.config;
        const channel =
            settings?.channelStore === 'db'
                ? await receiveChannel(port, inbound, $meta)
                : undefined;
        await port.dispatch(
            {...inbound, ...(channel && {channel})},
            {
                ...$meta,
                method: channel?.consumerMethod || forwardTarget(settings, inbound.account),
                mtid: 'request',
            },
        );
        return {handled: true};
    },
}));

/**
 * The stored row for this address, marked as active.
 *
 * A message is activity whether or not the consumer answers it, so the touch is written here and not by
 * the consumer: the continuation window is the channel's, and a consumer that crashes must not leave
 * the window unanswered for.
 */
const receiveChannel = async (
    port: IChatDispatchPort,
    inbound: IChatInbound,
    $meta: IMeta,
): Promise<IChatChannel | undefined> => {
    const found = channelOf(
        await port.dispatch(
            {
                platform: inbound.platform,
                account: inbound.account ?? '',
                conversationId: inbound.conversationId,
            },
            {...$meta, method: 'chat.channel.find', mtid: 'request'},
        ),
    );
    if (!found) return undefined;
    const touched = channelOf(
        await port.dispatch(
            {channelId: found.channelId, patch: {touch: true}},
            {...$meta, method: 'chat.channel.edit', mtid: 'request'},
        ),
    );
    return touched ?? found;
};
