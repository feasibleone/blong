import {hostname} from 'node:os';

import type {IAssert, IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * A real model, on a real loop (`@@T-591`).
 *
 * The scripted groups prove the realm's mechanics; they cannot prove the engine's wire, because the sim
 * never crosses the SDK. This group puts a qwen2.5-coder:14b on a LAN Ollama through the shapes a coding
 * session produces — a tool call, a file written, a question asked — and keeps each one to a single
 * action, because a 14B model on a 32k context answers a four-step procedure with prose. One action per
 * session is what it does reliably, and a nudge once when it answers nothing is what a real caller does
 * with it.
 *
 * Without the `ollama` intent there is no such account and every step says so and passes: a suite that
 * fails on a machine with no model is a suite nobody runs.
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
        engineAccountCheck,
        agentTicketClaim,
        agentSessionRun,
        agentEventFind,
        agentToolRun,
        taskPoolReset,
    } = context.handler;
    const $meta = {} as IMeta;

    const reachable = async (account: string): Promise<boolean> => {
        const checked = (await engineAccountCheck({account}, $meta)) as {reachable?: boolean};
        return checked?.reachable === true;
    };
    const claim = async (account: string): Promise<IClaimResult> => {
        await taskPoolReset({}, $meta);
        return (await agentTicketClaim(
            {workerId: thisHost(), engineAccount: account},
            $meta,
        )) as IClaimResult;
    };
    const run = async (
        sessionId: string,
        prompt: string,
        instructions: string,
    ): Promise<IRunResult> =>
        (await agentSessionRun(
            {sessionId, workerId: thisHost(), prompt, instructions},
            $meta,
        )) as IRunResult;
    const eventsOf = async (sessionId: string): Promise<string> => {
        const found = (await agentEventFind({sessionId, limit: 100}, $meta)) as {
            events: Array<Record<string, unknown>>;
        };
        return JSON.stringify(found.events ?? []);
    };
    const tool = async (
        ticketId: string,
        sessionId: string,
        toolName: string,
        args: unknown,
    ): Promise<string> => {
        const run_ = (await agentToolRun({ticketId, sessionId, call: {toolName, args}}, $meta)) as {
            result?: unknown;
        };
        const result = run_?.result;
        if (typeof result === 'string') return result;
        const record = (result ?? {}) as {content?: string; stdout?: string; output?: string};
        return String(record.content ?? record.stdout ?? record.output ?? '');
    };

    return {
        testAgentModel: ({
            name = 'agent model',
            account = 'qwen',
        }: {name?: string; account?: string} = {}) =>
            group(name)([
                async function aRealModelAnswersOneTurn(assert: IAssert) {
                    if (!(await reachable(account))) return;
                    const claimed = await claim(account);
                    const sessionId = String(claimed.session?.sessionId ?? '');
                    assert.ok(sessionId, 'a session is open for the model');
                    const ran = await run(
                        sessionId,
                        'Reply with the single word: ready',
                        'Answer in one short sentence. Do not call any tool. Do not explain.',
                    );
                    assert.equal(ran.status, 'done', 'the model finished the turn');
                    assert.ok(
                        String(ran.summary ?? '').length > 0,
                        `and said something (${JSON.stringify(ran.summary).slice(0, 120)})`,
                    );
                },

                async function theModelCallsAToolToReadTheWorkspace(assert: IAssert) {
                    if (!(await reachable(account))) return;
                    const claimed = await claim(account);
                    const ticketId = String(claimed.ticket?.ticketId ?? '');
                    const sessionId = String(claimed.session?.sessionId ?? '');
                    await tool(ticketId, sessionId, 'writeFile', {
                        path: 'NOTES.md',
                        content: 'release train: green',
                    });
                    const instructions =
                        "Call the tool readFile with {path: 'NOTES.md'}. Do not answer with text.";
                    await run(sessionId, 'Work the ticket.', instructions);
                    let seen = await eventsOf(sessionId);
                    if (!seen.includes('readFile')) {
                        // A 14B model answers prose often enough that one nudge is the honest handling:
                        // the caller says what it is missing and asks again, in the same session.
                        await run(
                            sessionId,
                            'You did not call the tool. Call it now.',
                            instructions,
                        );
                        seen = await eventsOf(sessionId);
                    }
                    assert.match(
                        seen,
                        /readFile/,
                        'the model chose a tool and the realm ran it',
                    );
                },

                async function theModelWritesAFileInTheWorkspace(assert: IAssert) {
                    if (!(await reachable(account))) return;
                    const claimed = await claim(account);
                    const ticketId = String(claimed.ticket?.ticketId ?? '');
                    const sessionId = String(claimed.session?.sessionId ?? '');
                    const instructions =
                        'Call the tool writeFile with exactly this JSON as its arguments: ' +
                        '{"path":"DONE.txt","content":"seen"}. Nothing else. No text in the reply.';
                    await run(sessionId, 'Work the ticket.', instructions);
                    let written = await tool(ticketId, sessionId, 'readFile', {
                        path: 'DONE.txt',
                    }).catch(() => '');
                    if (!written.includes('seen')) {
                        await run(
                            sessionId,
                            'You did not call the tool. Call it now.',
                            instructions,
                        );
                        written = await tool(ticketId, sessionId, 'readFile', {
                            path: 'DONE.txt',
                        }).catch(() => '');
                    }
                    assert.match(
                        written,
                        /seen/,
                        `the file the model wrote is in its workspace (content: ${written.slice(0, 40)}; ` +
                            `events: ${(await eventsOf(sessionId)).slice(0, 400)})`,
                    );
                },

                async function theModelAnswersFromWhatItRead(assert: IAssert) {
                    if (!(await reachable(account))) return;
                    const claimed = await claim(account);
                    const ticketId = String(claimed.ticket?.ticketId ?? '');
                    const sessionId = String(claimed.session?.sessionId ?? '');
                    await tool(ticketId, sessionId, 'writeFile', {
                        path: 'NOTES.md',
                        content: 'release train: green',
                    });
                    const readIt =
                        "Call the tool readFile with {path: 'NOTES.md'} and nothing else. " +
                        'Do not answer with text.';
                    await run(sessionId, 'Work the ticket.', readIt);
                    if (!(await eventsOf(sessionId)).includes('readFile'))
                        await run(sessionId, 'You did not call the tool. Call it now.', readIt);
                    // A second run on the same session replays the transcript from the checkpoint, so a
                    // reply that quotes the file is the checkpoint carrying the tool result — which is
                    // the one thing a resume in another process depends on.
                    const answered = await run(
                        sessionId,
                        'Report the file content.',
                        'Do not call any tool. Reply with the exact content of NOTES.md and nothing else.',
                    );
                    assert.match(
                        String(answered.summary ?? ''),
                        /release train: green/,
                        `the replayed transcript still carried the file (${String(answered.summary ?? '').slice(0, 120)})`,
                    );
                },

                async function theModelAsksAPersonAndCarriesOn(assert: IAssert) {
                    if (!(await reachable(account))) return;
                    const claimed = await claim(account);
                    const sessionId = String(claimed.session?.sessionId ?? '');
                    const ran = await run(
                        sessionId,
                        'Work the ticket.',
                        'Call the tool askHuman with {question: "Should I continue?"} and nothing ' +
                            'else. Do not answer with text.',
                    );
                    assert.equal(
                        ran.status,
                        'done',
                        `the question was answered and the loop ended (${String(ran.summary ?? '').slice(0, 80)})`,
                    );
                    assert.match(
                        await eventsOf(sessionId),
                        /askHuman/,
                        'and it went through the tool boundary to the configured question method',
                    );
                },
            ]),
    };
});
