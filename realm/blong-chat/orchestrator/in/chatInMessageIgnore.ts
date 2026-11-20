import {handler} from '@feasibleone/blong';
import type {IChatInbound} from '@feasibleone/blong/types';

/**
 * `chat.in.message.ignore` — the consumer a deployment gets until it names its own.
 *
 * A message from a person is not a fault the realm can refuse: the platform delivered it and expects
 * an answer, and a bridge with no business logic behind it has nothing to do with it. So the default
 * `chat.chatDispatch.forward` is this method — the delivery is logged and acknowledged, and naming a
 * real consumer in the config replaces it (`@@D-677`).
 */
export default handler(() => ({
    async chatInMessageIgnore(inbound: IChatInbound) {
        // Info, not debug: a deployment that reaches this method is one nobody configured a consumer
        // for, and that is worth a line per message rather than silence.
        this.signal?.chatInboundUnconsumed?.({
            kind: inbound.kind,
            platform: inbound.platform,
            account: inbound.account,
            conversationId: inbound.conversationId,
            messageId: inbound.messageId,
        });
        return {handled: true};
    },
}));
