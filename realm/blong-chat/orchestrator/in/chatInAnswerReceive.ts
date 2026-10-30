import {handler} from '@feasibleone/blong';
import type {IChatAnswer, IChatInbound} from '@feasibleone/blong/types';

import {pendingKey, pendingTake} from '../prompt/pending.ts';

/**
 * `chat.in.answer.receive` — the answer to a question, delivered once.
 *
 * This is the event path and the resolution of an ask at the same time: the parked promise is taken
 * (so a platform retrying the click cannot answer twice) and resolved here. An answer nobody is
 * waiting for is a click that arrived after the timeout — a real condition, and one the platform has
 * already been answered for — so it is acknowledged and logged rather than failing, because nothing the
 * caller could do would change it.
 *
 * Two callers reach it with two shapes: the platform's port sends a whole `IChatInbound`, while the
 * gateway route sends the flat fields a caller naturally has. The flat form is widened here rather
 * than at every entry point, so one method keeps one contract.
 */
export interface IChatAnswerCall {
    platform: string;
    account?: string;
    conversationId: string;
    promptId: string;
    value?: string;
    values?: string[];
    text?: string;
}

/** Both shapes become the inbound one, so nothing below has to ask which arrived. */
const asInbound = (
    params: IChatInbound | IChatAnswerCall,
): IChatInbound & {answer: IChatAnswer} => {
    const inbound = params as IChatInbound & {answer?: IChatAnswer};
    if (inbound.answer) return inbound as IChatInbound & {answer: IChatAnswer};
    const flat = params as IChatAnswerCall;
    const answer: IChatAnswer = {
        promptId: flat.promptId,
        ...(flat.value !== undefined && {value: flat.value}),
        ...(flat.values !== undefined && {values: flat.values}),
        ...(flat.text !== undefined && {text: flat.text}),
    };
    return {
        kind: 'answer',
        platform: flat.platform as IChatInbound['platform'],
        account: flat.account,
        conversationId: flat.conversationId,
        answer,
    };
};

export default handler(() => ({
    async chatInAnswerReceive(params: IChatInbound | IChatAnswerCall): Promise<{handled: boolean}> {
        const inbound = asInbound(params);
        const {answer} = inbound;
        const entry = pendingTake(pendingKey(answer.promptId, inbound));
        if (entry) {
            clearTimeout(entry.timer);
            // A submit that names no selection is answered with what the controls were holding: an
            // inline question reports a tick and a submit as two interactions, and the second one
            // may arrive without the state the first one carried (`@@D-691`).
            const empty =
                answer.value === undefined &&
                answer.values === undefined &&
                answer.text === undefined;
            entry.resolve(empty && entry.pick ? {...answer, ...entry.pick} : answer);
            return {handled: true};
        }
        // Nothing waits for it: the click arrived after the ask gave up, which the port has already
        // logged as the request it answered. Acknowledging is the whole answer — the platform retries a
        // refusal, and a caller cannot un-timeout a question.
        return {handled: true};
    },
}));
