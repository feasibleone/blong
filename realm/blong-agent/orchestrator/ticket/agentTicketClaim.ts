import {randomUUID} from 'node:crypto';

import {handler, type IMeta} from '@feasibleone/blong';

import {agentSettings, type IAgentDispatchPort} from '../settings.ts';

/**
 * `agent.ticket.claim` — take one ticket and open the session beside it.
 *
 * The claim and the session are one step because a claimed ticket nobody runs is a ticket the pool
 * has taken out of circulation until its lease runs out: the claim decides, the workspace is prepared,
 * and the session is the record of who is running it (`@@D-707`).
 *
 * A ticket that names a workspace of its own is only taken when that workspace is the one this host
 * prepared. The pool is shared and the workspace is not, so a ticket claimed on the wrong host would
 * edit a directory nobody deploys and report success — refusing it and handing the ticket back is the
 * only answer that keeps the pool honest (`@@D-707`).
 */
export interface IAgentTicketClaimParams {
    workerId: string;
    /** The engine adapter instance that will run it, as the account map is keyed (`@@D-712`). */
    engineAdapter?: string;
    engineAccount?: string;
    engineMode?: 'step' | 'native';
    /** How long the claim holds; the port's own default when absent. */
    leaseMs?: number;
}

export default handler(
    ({
        handler: {
            taskNextClaim,
            taskTicketRelease,
            workspaceRepoPrepare,
            'db/agentSessionAdd': agentSessionAdd,
            engineAccountCheck,
        },
        errors: {errorAgentWorkspaceMissing},
    }) => ({
        async agentTicketClaim(
            params: IAgentTicketClaimParams,
            $meta: IMeta,
        ): Promise<{ticket?: Record<string, unknown>; session?: Record<string, unknown>}> {
            const port = this as unknown as IAgentDispatchPort;
            const settings = agentSettings(port.config);
            const claimed = (await taskNextClaim(
                {workerId: params.workerId, leaseMs: params.leaseMs ?? settings.leaseMs},
                $meta,
            )) as {ticket?: Record<string, unknown>};
            const ticket = claimed?.ticket;
            if (!ticket) return {};
            const ticketId = String(ticket.ticketId);
            const prepared = (await workspaceRepoPrepare({ticketId}, $meta)) as {
                workspacePath: string;
                baseCommit?: string;
            };
            const source = ticket.workspaceSource ? String(ticket.workspaceSource) : undefined;
            if (source && source !== prepared.workspacePath) {
                // Hand it back before refusing: a ticket this host will not run has to be free for the
                // host that can.
                await taskTicketRelease(
                    {ticketId, workerId: params.workerId, ticketStatus: 'todo'},
                    $meta,
                );
                throw errorAgentWorkspaceMissing({workspacePath: source});
            }
            const sessionId = randomUUID();
            const account = params.engineAccount ?? '';
            // The account decides who owns the loop (`@@D-708`): a caller that names no mode gets the
            // one the engine reports, and `step` is only the answer when nobody says otherwise.
            const checked = account
                ? ((await engineAccountCheck({account}, $meta)) as {mode?: string})
                : undefined;
            const added = (await agentSessionAdd(
                {
                    sessionId,
                    ticketId,
                    ticketTitle: ticket.ticketTitle ? String(ticket.ticketTitle) : undefined,
                    status: 'claimed',
                    engineAdapter: params.engineAdapter ?? 'engine',
                    engineAccount: account,
                    engineMode: params.engineMode ?? checked?.mode ?? 'step',
                    workerId: params.workerId,
                    workspacePath: prepared.workspacePath,
                    baseCommit: prepared.baseCommit,
                },
                $meta,
            )) as {session: Record<string, unknown>};
            return {ticket, session: added.session};
        },
    }),
);
