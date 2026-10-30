import {handler} from '@feasibleone/blong';

import {pendingList, type IParkedPrompt} from './pending.ts';

/**
 * `chat.prompt.find` — what is waiting for an answer right now.
 *
 * The read side of the ask, and the only way to see the prompt store without answering anything. It is
 * what a local run uses to check that a question really was sent after a platform accepted it, and the
 * groundwork for a page that would list the pending questions of a deployment (`plan.prompt.md`).
 */
export default handler(() => ({
    async chatPromptFind(): Promise<{prompts: IParkedPrompt[]}> {
        return {prompts: pendingList()};
    },
}));
