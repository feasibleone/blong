import {randomUUID} from 'node:crypto';

import {handler, type IMeta} from '@feasibleone/blong';
import type {IAgentSessionResult, IAgentStepResult} from '@feasibleone/blong/types';

import {agentSettings, type IAgentDispatchPort} from '../settings.ts';
import {agentHistory, agentToolDefinitions} from '../tools.ts';

/**
 * `agent.session.run` — the loop, in whichever of the two modes the session was opened in.
 *
 * A `step` session drives itself: one model turn, the calls it asked for, a checkpoint, again. A
 * `native` session hands the prompt to the engine and reports what it did, because that engine owns its
 * own loop and a realm that re-drove it would be fighting it (`@@D-708`).
 *
 * The checkpoint is written **after** every step's calls have run, never before: a checkpoint is what a
 * resume replays, so it must describe a transcript whose tool results are all present. The one exception
 * is a pending question, which `agent.question.ask` checkpoints before it asks — that is the boundary the
 * interruption lives on (`@@D-709`).
 *
 * `engine.session.close` is in `finally` in both modes: a scripted cursor or a harness subprocess left
 * behind is a leak the next run inherits, and a failed session leaks it just as readily as a finished one.
 */
export interface IAgentSessionRunParams {
    sessionId: string;
    workerId?: string;
    /** The opening instruction, when the session has no checkpoint yet. */
    prompt?: string;
    /** Replaces the built-in instruction block, so a deployment can set its own tone. */
    instructions?: string;
    /** The conversation an `askHuman` asks in, carried from the claimed ticket. */
    channel?: {platform?: string; account?: string; conversationId?: string};
    /** The answer a resume folds in as the result of the tool call that was pending. */
    answer?: {promptId: string; answerText: string; senderName?: string};
}

export interface IAgentSessionRunResult {
    status: 'done' | 'failed' | 'suspended';
    sessionId: string;
    steps: number;
    summary?: string;
    promptId?: string;
}

const DEFAULT_INSTRUCTIONS = [
    'You are working one ticket in a workspace of your own.',
    'Read before you write, keep the change small, and say what you concluded.',
    'Use the tools you were given; there is no other way to see the workspace.',
].join(' ');

export default handler(
    ({
        handler: {
            'db/agentSessionGet': agentSessionGet,
            'db/agentSessionEdit': agentSessionEdit,
            'db/agentCheckpointLastGet': agentCheckpointLastGet,
            'db/agentCheckpointAdd': agentCheckpointAdd,
            'db/agentEventAdd': agentEventAdd,
            'db/agentEventFind': agentEventFind,
            agentToolRun,
            agentSessionSuspend,
            agentTicketRelease,
            engineStepRun,
            engineSessionRun,
            engineSessionClose,
        },
        errors: {errorAgentSessionNotFound, errorAgentSessionSuspended, errorAgentStepLimitReached},
    }) => ({
        async agentSessionRun(
            params: IAgentSessionRunParams,
            $meta: IMeta,
        ): Promise<IAgentSessionRunResult> {
            const port = this as unknown as IAgentDispatchPort;
            const settings = agentSettings(port.config);
            const found = (await agentSessionGet({sessionId: params.sessionId}, $meta)) as {
                session?: Record<string, unknown>;
            };
            const session = found.session;
            if (!session) throw errorAgentSessionNotFound({sessionId: params.sessionId});
            const status = String(session.status ?? '');
            if (status === 'suspended' && !params.answer)
                throw errorAgentSessionSuspended({sessionId: params.sessionId});
            const ticketId = String(session.ticketId ?? '');
            const account = String(session.engineAccount ?? '');
            const mode = String(session.engineMode ?? 'step');
            const workspacePath = String(session.workspacePath ?? '');
            const workerId =
                params.workerId ?? (session.workerId ? String(session.workerId) : undefined);
            const tools = agentToolDefinitions();
            const instructions = params.instructions ?? DEFAULT_INSTRUCTIONS;

            await agentSessionEdit(
                {sessionId: params.sessionId, patch: {status: 'running'}},
                $meta,
            );

            let sequence = (
                (await agentEventFind({sessionId: params.sessionId, limit: 500}, $meta)) as {
                    events: Array<Record<string, unknown>>;
                }
            ).events.length;
            const logEvent = async (kind: string, payload?: unknown) => {
                sequence += 1;
                await agentEventAdd(
                    {
                        eventId: randomUUID(),
                        sessionId: params.sessionId,
                        sequence,
                        kind,
                        payloadJSON:
                            payload === undefined
                                ? undefined
                                : JSON.stringify(payload).slice(0, 8000),
                    },
                    $meta,
                );
            };

            const last = (await agentCheckpointLastGet({sessionId: params.sessionId}, $meta)) as {
                checkpoint?: Record<string, unknown>;
            };
            const history = agentHistory(last.checkpoint?.historyJSON);
            let checkpointSequence = Number(last.checkpoint?.sequence ?? 0);
            let stepCount = Number(last.checkpoint?.stepCount ?? 0);
            // The question path writes a pending checkpoint of its own while a step is parked, so the
            // sequence has to be taken from the table rather than counted in memory — two writers with
            // one counter is a duplicate key waiting for the first human question.
            const nextSequence = async (): Promise<number> => {
                const now = (await agentCheckpointLastGet(
                    {sessionId: params.sessionId},
                    $meta,
                )) as {checkpoint?: Record<string, unknown>};
                checkpointSequence = Number(now.checkpoint?.sequence ?? 0) + 1;
                return checkpointSequence;
            };
            if (history.length === 0) {
                history.push({role: 'system', text: instructions});
                const opening =
                    params.prompt ??
                    [String(session.ticketTitle ?? ''), ''].join('\n').trim() ??
                    'Work the ticket.';
                history.push({role: 'user', text: opening || 'Work the ticket.'});
            }
            if (params.answer) {
                const pendingToolCallId = last.checkpoint?.pendingToolCallId
                    ? String(last.checkpoint.pendingToolCallId)
                    : undefined;
                history.push({
                    role: 'tool',
                    toolName: 'askHuman',
                    toolCallId: pendingToolCallId,
                    result: {answer: params.answer.answerText},
                });
                await logEvent('answer', {
                    promptId: params.answer.promptId,
                    text: params.answer.answerText,
                });
            }

            try {
                if (mode === 'native') {
                    const run = (await engineSessionRun(
                        {
                            account,
                            prompt:
                                params.prompt ?? String(session.ticketTitle ?? 'Work the ticket.'),
                            tools,
                            sessionKey: session.engineSessionId
                                ? String(session.engineSessionId)
                                : undefined,
                            workspacePath,
                        },
                        $meta,
                    )) as IAgentSessionResult;
                    if (run.sessionKey)
                        await agentSessionEdit(
                            {sessionId: params.sessionId, patch: {engineSessionId: run.sessionKey}},
                            $meta,
                        );
                    for (const reported of run.events ?? [])
                        await logEvent(reported.kind, reported.payload);
                    await logEvent('step', {text: run.text, finishReason: run.finishReason});
                    if (workerId)
                        await agentTicketRelease(
                            {ticketId, workerId, ticketStatus: 'done', summary: run.text},
                            $meta,
                        );
                    return {
                        status: 'done',
                        sessionId: params.sessionId,
                        steps: run.events?.length ?? 1,
                        summary: run.text,
                    };
                }
                for (let step = 0; step < settings.maxSteps; step += 1) {
                    const turn = (await engineStepRun(
                        {account, instructions, history, tools},
                        $meta,
                    )) as IAgentStepResult;
                    history.push({
                        role: 'assistant',
                        text: turn.text,
                        toolCalls: turn.toolCalls,
                    });
                    stepCount += 1;
                    await logEvent('step', {text: turn.text, finishReason: turn.finishReason});
                    if (!turn.toolCalls?.length) {
                        await nextSequence();
                        await agentCheckpointAdd(
                            {
                                checkpointId: randomUUID(),
                                sessionId: params.sessionId,
                                sequence: checkpointSequence,
                                historyJSON: JSON.stringify(history),
                                stepCount,
                            },
                            $meta,
                        );
                        if (workerId)
                            await agentTicketRelease(
                                {ticketId, workerId, ticketStatus: 'done', summary: turn.text},
                                $meta,
                            );
                        return {
                            status: 'done',
                            sessionId: params.sessionId,
                            steps: stepCount,
                            summary: turn.text,
                        };
                    }
                    let finished: string | undefined;
                    for (const call of turn.toolCalls.slice(0, settings.maxToolCalls)) {
                        const ran = (await agentToolRun(
                            {
                                ticketId,
                                sessionId: params.sessionId,
                                call,
                                channel: params.channel,
                            },
                            $meta,
                        )) as {
                            result?: {suspended?: boolean; promptId?: string};
                            finished?: boolean;
                        };
                        history.push({
                            role: 'tool',
                            toolName: call.toolName,
                            toolCallId: call.toolCallId,
                            result: ran?.result,
                        });
                        await logEvent('tool', {toolName: call.toolName, result: ran?.result});
                        if (ran?.result?.suspended) {
                            const suspended = (await agentSessionSuspend(
                                {
                                    sessionId: params.sessionId,
                                    promptId: ran.result.promptId,
                                    reason: 'question',
                                },
                                $meta,
                            )) as {promptId?: string};
                            return {
                                status: 'suspended',
                                sessionId: params.sessionId,
                                steps: stepCount,
                                promptId: suspended?.promptId,
                            };
                        }
                        if (ran?.finished) {
                            finished = String(
                                (ran.result as {summary?: string} | undefined)?.summary ?? '',
                            );
                            break;
                        }
                    }
                    await nextSequence();
                    await agentCheckpointAdd(
                        {
                            checkpointId: randomUUID(),
                            sessionId: params.sessionId,
                            sequence: checkpointSequence,
                            historyJSON: JSON.stringify(history),
                            stepCount,
                        },
                        $meta,
                    );
                    if (finished !== undefined) {
                        if (workerId)
                            await agentTicketRelease(
                                {ticketId, workerId, ticketStatus: 'done', summary: finished},
                                $meta,
                            );
                        return {
                            status: 'done',
                            sessionId: params.sessionId,
                            steps: stepCount,
                            summary: finished,
                        };
                    }
                }
                await agentSessionEdit(
                    {sessionId: params.sessionId, patch: {status: 'failed'}},
                    $meta,
                );
                if (workerId)
                    await agentTicketRelease({ticketId, workerId, ticketStatus: 'failed'}, $meta);
                throw errorAgentStepLimitReached({
                    sessionId: params.sessionId,
                    maxSteps: settings.maxSteps,
                });
            } finally {
                await engineSessionClose({account, workspacePath}, $meta);
            }
        },
    }),
);
