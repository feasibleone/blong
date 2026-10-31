// cspell:ignore purg
import {hostname} from 'node:os';

import {handler, type IMeta} from '@feasibleone/blong';

import type {IAgentSessionRunResult} from '../session/agentSessionRun.ts';

/**
 * `agent.recovery.scan` — what a host does with the sessions it left suspended.
 *
 * A suspension is a state this host can only resolve by asking: the workspace is still on disk, the
 * transcript is still in the checkpoint, and whether the work is still wanted is something the person who
 * opened the ticket knows (`@@D-705`). So the scan asks, and every answer has a consequence — resume it,
 * purge it and close the ticket as failed, or leave it suspended for a later scan. Silence is the fourth
 * answer and it leaves the session exactly where it was.
 */
export interface IAgentRecoveryScanParams {
    workerId?: string;
    limit?: number;
}

const thisHost = (): string => process.env.HOSTNAME ?? hostname();

export default handler(
    ({
        handler: {
            'db/agentSessionFind': agentSessionFind,
            agentQuestionAsk,
            agentSessionResume,
            agentTicketRelease,
            workspaceRepoRemove,
        },
    }) => ({
        async agentRecoveryScan(params: IAgentRecoveryScanParams, $meta: IMeta) {
            const workerId = params.workerId ?? thisHost();
            const found = (await agentSessionFind(
                {status: 'suspended', workerId, limit: params.limit ?? 20},
                $meta,
            )) as {sessions: Array<Record<string, unknown>>};
            const result = {
                scanned: 0,
                resumed: 0,
                purged: 0,
                left: 0,
                unanswered: 0,
                decisions: [] as string[],
            };
            for (const session of found.sessions ?? []) {
                result.scanned += 1;
                const sessionId = String(session.sessionId);
                const ticketId = String(session.ticketId ?? '');
                const asked = (await agentQuestionAsk(
                    {
                        sessionId,
                        ticketId,
                        question:
                            `Session ${sessionId} for ticket ${ticketId} is suspended. Resume it, purge its ` +
                            'workspace, or leave it for later?',
                        options: ['resume', 'purge', 'leave'],
                        conversationId: ticketId,
                    },
                    $meta,
                )) as {answerText?: string; suspended?: boolean};
                if (asked.suspended) {
                    result.unanswered += 1;
                    continue;
                }
                const decision = (asked.answerText ?? '').trim().toLowerCase();
                // What the person said, kept beside what it caused: a scan that answers `{left: 1}` is a
                // scan a reader has to run again to explain.
                result.decisions.push(decision);
                if (decision.startsWith('res')) {
                    const ran = (await agentSessionResume(
                        {sessionId, workerId},
                        $meta,
                    )) as IAgentSessionRunResult;
                    if (ran.status === 'done') result.resumed += 1;
                    else result.left += 1;
                    continue;
                }
                if (decision.startsWith('purg') || decision.startsWith('discard')) {
                    await workspaceRepoRemove({ticketId}, $meta);
                    await agentTicketRelease({ticketId, workerId, ticketStatus: 'failed'}, $meta);
                    result.purged += 1;
                    continue;
                }
                result.left += 1;
            }
            return result;
        },
    }),
);
