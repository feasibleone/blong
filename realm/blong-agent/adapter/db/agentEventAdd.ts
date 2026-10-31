import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * `agent.event.add` — one line of what happened.
 *
 * A step, a tool call, a command, an ask, an answer, a suspension: the trace is what a resume reads to
 * say what a session did, and what a board would show without a page of its own (`@@D-705`).
 */
export default handler(({lib: {uuidBuf}}) => ({
    async agentEventAdd(
        params: {
            eventId: string;
            sessionId: string;
            sequence: number;
            kind: string;
            payloadJSON?: string;
        },
        _$meta: IMeta,
    ): Promise<{eventId: string}> {
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        await qb('agent_event').insert({
            eventId: uuidBuf(params.eventId),
            sessionId: uuidBuf(params.sessionId),
            sequence: params.sequence,
            kind: params.kind,
            payloadJSON: params.payloadJSON ?? null,
            createdAt: new Date(),
        });
        return {eventId: params.eventId};
    },
}));
