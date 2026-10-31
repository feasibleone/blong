import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * `test.agent.question.echo` — the question a test answers at once.
 *
 * The realm asks its questions through `questionMethod`, which in a deployment is `chat.prompt.ask`.
 * A realm test has no chat child, and a question with nowhere to go would park for the whole thirty
 * minutes, so the integration config points the method here and the answer is the one the test chose.
 */
export default handler(() => ({
    async testAgentQuestionEcho(
        params: {text: string; promptId?: string; options?: Array<{value?: string}>},
        _$meta: IMeta,
    ): Promise<{value: string; promptId?: string}> {
        // A question that says `never` is answered after the realm's own timeout, which is how the
        // suspension path is exercised without a mock standing in for the wait.
        if (params.text.includes('never')) await new Promise(resolve => setTimeout(resolve, 6_000));
        // A recovery scan asks one session at a time and names the ticket in the question, so the stub
        // can answer differently per ticket the way a person would: `T-1002` is the one that gets
        // purged, everything else takes the first option (`resume`).
        if (params.text.includes('T-1002') && params.options?.some(o => o.value === 'purge'))
            return {value: 'purge', promptId: params.promptId};
        const first = params.options?.[0]?.value;
        return {value: first ?? 'the chosen fix', promptId: params.promptId};
    },
}));
