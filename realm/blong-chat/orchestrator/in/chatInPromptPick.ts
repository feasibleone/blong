import {handler} from '@feasibleone/blong';
import type {IChatInbound} from '@feasibleone/blong/types';

import {pendingKey, pendingPick} from '../prompt/pending.ts';

/**
 * `chat.in.promptPick` — a control of an inline question was toggled, nothing is answered yet.
 *
 * A radio group or a checkbox list reports every toggle as its own interaction, because that is the
 * only moment the platform says what the element now holds. The person is not answering until they
 * press submit, so this settles nothing: it remembers the selection against the waiting question,
 * which is what makes a submit that arrives without a selection answerable (`@@D-691`).
 *
 * A toggle for a question nobody is waiting for is a click that arrived after the ask gave up, and
 * is acknowledged rather than refused — the platform has already been answered, and a refusal only
 * makes it retry.
 */
export default handler(() => ({
    async chatInPromptPick(inbound: IChatInbound): Promise<{handled: boolean}> {
        const {pick} = inbound;
        if (pick) pendingPick(pendingKey(pick.promptId, inbound), pick);
        return {handled: true};
    },
}));
