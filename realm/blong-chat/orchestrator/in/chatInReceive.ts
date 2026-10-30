import {handler, type IMeta} from '@feasibleone/blong';
import type {IChatInbound} from '@feasibleone/blong/types';

import {pendingForConversation} from '../prompt/pending.ts';

/**
 * `chat.in.receive` — the one method a platform port dispatches to.
 *
 * A port maps what arrived and says what kind it is; deciding what that means is the realm's, made
 * here once for every platform. Four cases:
 *
 * - an answer goes to `chat.in.answer.receive`, which settles the ask that was waiting;
 * - a toggle of an inline question's controls is remembered against that ask, because the answer is
 *   the submit that follows and not the tick;
 * - a form request goes to the outbound side, because opening a modal is a call back to the platform;
 * - a message is first offered to the prompt store — a typed reply carries no prompt id, so a pending
 *   free-text question claims it — and otherwise belongs to whoever configured
 *   `chat.chatDispatch.forward`.
 */
export default handler(
    ({
        handler: {chatInAnswerReceive, chatInMessageReceive, chatInPromptPick, chatOutPromptForm},
    }) => ({
        async chatInReceive(inbound: IChatInbound, $meta: IMeta): Promise<{handled: boolean}> {
            if (inbound.kind === 'answer' && inbound.answer) {
                // Who answered travels with the answer, because the answer is what gets shown back
                // (`@@D-693`), and a port that already named the person keeps its word.
                const who = inbound.answer.sender ?? inbound.sender;
                return chatInAnswerReceive(
                    who ? {...inbound, answer: {...inbound.answer, sender: who}} : inbound,
                    $meta,
                );
            }
            if (inbound.kind === 'prompt.pick' && inbound.pick)
                return chatInPromptPick(inbound, $meta);
            if (inbound.kind === 'prompt.form' && inbound.form)
                return chatOutPromptForm(
                    {
                        platform: inbound.platform,
                        account: inbound.account,
                        conversationId: inbound.conversationId,
                        promptId: inbound.form.promptId,
                        triggerId: inbound.form.triggerId,
                    },
                    $meta,
                );
            if (inbound.kind !== 'message') return {handled: false};
            const parked = inbound.text ? pendingForConversation(inbound) : undefined;
            if (parked)
                return chatInAnswerReceive(
                    {
                        ...inbound,
                        kind: 'answer',
                        answer: {
                            promptId: parked.params.prompt.promptId,
                            text: inbound.text,
                            ...(inbound.sender && {sender: inbound.sender}),
                        },
                    },
                    $meta,
                );
            return chatInMessageReceive(inbound, $meta);
        },
    }),
);
