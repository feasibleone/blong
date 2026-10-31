import {hostname} from 'node:os';

import type {IAssert, IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * The one test that proves the cross-realm seam rather than the realm's own method (`@@T-574`).
 *
 * Every other group answers a question through `test.agent.question.echo`, which proves the realm asks.
 * This one answers through `blong-chat`: the question leaves as `chat.prompt.ask`, the chat realm sends
 * the controls to its own Slack simulator, and an answer delivered on `chat.in.answer.receive` settles
 * the parked promise — so what is asserted is the contract between two realms, not a substitute for it.
 *
 * The run is started and *not* awaited first: the question parks inside it, so the pending checkpoint is
 * what has to be observed, and it is observed for the reason it exists — a cold answer needs the prompt
 * id from the database rather than from the caller's memory.
 */
interface IClaimResult {
    ticket?: {ticketId?: string};
    session?: {sessionId?: string};
}

interface IRunResult {
    status?: string;
    summary?: string;
}

const thisHost = (): string => process.env.HOSTNAME ?? hostname();

export default handler(context => {
    const {group} = context.lib;
    const {
        agentTicketClaim,
        agentSessionRun,
        agentCheckpointLastGet,
        chatInAnswerReceive,
        taskPoolReset,
    } = context.handler;
    const $meta = {} as IMeta;
    const pendingPrompt = async (sessionId: string): Promise<string | undefined> => {
        for (let attempt = 0; attempt < 200; attempt += 1) {
            const last = (await agentCheckpointLastGet({sessionId}, $meta)) as {
                checkpoint?: Record<string, unknown>;
            };
            const promptId = last.checkpoint?.pendingPromptId;
            if (typeof promptId === 'string' && promptId.length > 0) return promptId;
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        return undefined;
    };
    return {
        testAgentChat: ({name = 'agent chat'}: {name?: string} = {}) =>
            group(name)([
                async function aQuestionIsAskedInTheChannelAndAnswered(assert: IAssert) {
                    await taskPoolReset({}, $meta);
                    const claimed = (await agentTicketClaim(
                        {workerId: thisHost(), engineAccount: 'asking'},
                        $meta,
                    )) as IClaimResult;
                    const sessionId = String(claimed.session?.sessionId ?? '');
                    assert.ok(sessionId, 'a session is open beside the claim');
                    const running = agentSessionRun(
                        {
                            sessionId,
                            workerId: thisHost(),
                            // The conversation the claim's ticket names, which is what a question is
                            // asked in: the worker passes it, so the test passes it too.
                            channel: {platform: 'slack', account: 'demo', conversationId: 'D1'},
                            prompt: 'Work the ticket.',
                            instructions:
                                "Call the tool askHuman with {question: 'Ship it?'} and nothing else. " +
                                'Do not answer with text.',
                        },
                        $meta,
                    ) as Promise<IRunResult>;
                    // The question parks inside the run, so the answer is delivered while it waits. A
                    // failure before the ask is kept rather than swallowed: the assertion below then
                    // says what stopped the loop instead of only that nothing was pending.
                    const failed = running.catch((error: unknown) => ({
                        error: String((error as Error)?.message ?? error),
                    }));
                    const promptId = await pendingPrompt(sessionId);
                    assert.ok(
                        promptId,
                        `the question left a pending checkpoint before it was asked (${JSON.stringify(await Promise.race([failed, Promise.resolve(undefined)]) ?? 'still running')})`,
                    );
                    // The checkpoint is written *before* the ask, so it may exist a moment before the
                    // chat realm has parked on the prompt. Delivering the same answer more than once is
                    // what a platform does with a retry, so the loop is legal and the parked promise is
                    // the authority on which delivery counted.
                    let settled = false;
                    const watched = running.then(
                        result => {
                            settled = true;
                            return result;
                        },
                        error => {
                            settled = true;
                            throw error;
                        },
                    );
                    let accepted: boolean | undefined;
                    for (let attempt = 0; attempt < 100 && !settled; attempt += 1) {
                        const answered = (await chatInAnswerReceive(
                            {
                                platform: 'slack',
                                account: 'demo',
                                conversationId: 'D1',
                                promptId: promptId as string,
                                value: 'yes',
                            },
                            $meta,
                        )) as {handled?: boolean};
                        accepted ??= answered.handled;
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                    assert.equal(accepted, true, 'the chat realm acknowledged the answer');
                    const ran = await watched;
                    assert.equal(
                        ran.status,
                        'done',
                        `and the session carried on to its end (${String(ran.summary ?? '').slice(0, 80)})`,
                    );
                },
            ]),
    };
});
