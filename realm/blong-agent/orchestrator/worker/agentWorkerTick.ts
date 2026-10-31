import {hostname} from 'node:os';

import {handler, type IMeta} from '@feasibleone/blong';

import type {IAgentSessionRunResult} from '../session/agentSessionRun.ts';
import {agentSettings, type IAgentDispatchPort} from '../settings.ts';

/**
 * `agent.worker.tick` — one pass: the inbox, then a claim.
 *
 * The inbox comes first because an answer that has already arrived is work this host can finish without
 * taking anything new, and a tick that claimed before looking would leave a resumed session waiting
 * behind a fresh ticket (`@@D-704`).
 *
 * A tick with no engine account configured does not claim: taking a ticket and then having nothing to
 * run it with turns a configuration mistake into a lease the pool has to wait out.
 */
export interface IAgentWorkerTickParams {
    workerId?: string;
    engineAdapter?: string;
    engineAccount?: string;
    engineMode?: 'step' | 'native';
}

const thisHost = (): string => process.env.HOSTNAME ?? hostname();

export default handler(
    ({
        handler: {
            'db/agentAnswerFind': agentAnswerFind,
            'db/agentSessionGet': agentSessionGet,
            'db/agentAnswerConsume': agentAnswerConsume,
            agentSessionResume,
            agentTicketClaim,
            agentSessionRun,
        },
    }) => ({
        async agentWorkerTick(params: IAgentWorkerTickParams, $meta: IMeta) {
            const port = this as unknown as IAgentDispatchPort;
            const settings = agentSettings(port.config);
            const workerId = params.workerId ?? thisHost();
            let resumed = 0;
            const waiting = (await agentAnswerFind({consumed: false, limit: 10}, $meta)) as {
                answers: Array<Record<string, unknown>>;
            };
            for (const answer of waiting.answers ?? []) {
                const sessionId = answer.sessionId ? String(answer.sessionId) : undefined;
                if (!sessionId) continue;
                const found = (await agentSessionGet({sessionId}, $meta)) as {
                    session?: Record<string, unknown>;
                };
                const session = found.session;
                if (!session) continue;
                if (String(session.status ?? '') !== 'suspended') continue;
                if (String(session.workerId ?? '') !== workerId) continue;
                await agentAnswerConsume({answerId: String(answer.answerId)}, $meta);
                try {
                    await agentSessionResume(
                        {
                            sessionId,
                            answer: {
                                promptId: String(answer.promptId ?? ''),
                                answerText: String(answer.answerText ?? ''),
                                senderName: answer.senderName
                                    ? String(answer.senderName)
                                    : undefined,
                            },
                        },
                        $meta,
                    );
                } catch (err) {
                    // A suspended session with no checkpoint cannot be replayed, and one such row must
                    // not stop the tick from resuming the others: recovery purges it once it is stale.
                    if ((err as {code?: string}).code !== 'agent.checkpointMissing') throw err;
                    port.log?.warn?.(
                        `a suspended session had no checkpoint to resume from, skipped: ${sessionId}`,
                    );
                    continue;
                }
                resumed += 1;
            }
            const account = params.engineAccount ?? settings.engineAccount;
            if (!account)
                return {claimed: false, resumed, reason: 'no engine account is configured'};
            const claimed = (await agentTicketClaim(
                {
                    workerId,
                    engineAdapter: params.engineAdapter ?? settings.engineAdapter,
                    engineAccount: account,
                    engineMode: params.engineMode,
                },
                $meta,
            )) as {ticket?: Record<string, unknown>; session?: Record<string, unknown>};
            if (!claimed?.ticket || !claimed.session) return {claimed: false, resumed};
            const sessionId = String(claimed.session.sessionId);
            const ticket = claimed.ticket;
            const run = (await agentSessionRun(
                {
                    sessionId,
                    workerId,
                    prompt: String(ticket.ticketDescription ?? ticket.ticketTitle ?? ''),
                    channel: {
                        platform: ticket.platformName ? String(ticket.platformName) : undefined,
                        account: ticket.accountAlias ? String(ticket.accountAlias) : undefined,
                        conversationId: ticket.conversationId
                            ? String(ticket.conversationId)
                            : undefined,
                    },
                },
                $meta,
            )) as IAgentSessionRunResult;
            return {claimed: true, resumed, sessionId, status: run.status, steps: run.steps};
        },
    }),
);
