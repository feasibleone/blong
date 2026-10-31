import {randomUUID} from 'node:crypto';
import {hostname} from 'node:os';

import type {IAssert, IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * The wake-up channel, end to end inside one process (`@@T-572`).
 *
 * The message is published on the broker and arrives back as a dispatch, so what is proven is the
 * transport and the routing rather than the resume itself: the session has an answer already stored, and
 * nothing but the wake is going to act on it before the next tick. The second step is the other half of
 * the rule — a wake delivered to a pod that does not hold the workspace must change nothing.
 */
interface IClaimResult {
    ticket?: {ticketId?: string};
    session?: {sessionId?: string};
}

const thisHost = (): string => process.env.HOSTNAME ?? hostname();

export default handler(context => {
    const {group} = context.lib;
    const {
        agentTicketClaim,
        agentSessionGet,
        agentSessionRun,
        agentSessionSuspend,
        agentAnswerAdd,
        taskPoolReset,
    } = context.handler;
    const handlers = context.handler as unknown as Record<string, unknown>;
    const publish = handlers['notify.pub.publish'] as (
        params: unknown,
        $meta: unknown,
    ) => Promise<unknown>;
    const $meta = {} as IMeta;
    const statusOf = async (sessionId: string): Promise<string> => {
        const found = (await agentSessionGet({sessionId}, $meta)) as {
            session?: Record<string, unknown>;
        };
        return String(found.session?.status ?? '');
    };
    const park = async (
        workerId: string,
    ): Promise<{sessionId: string; ticketId: string; promptId: string}> => {
        await taskPoolReset({}, $meta);
        const claimed = (await agentTicketClaim(
            {workerId, engineAccount: 'local'},
            $meta,
        )) as IClaimResult;
        const sessionId = String(claimed.session?.sessionId ?? '');
        const ticketId = String(claimed.ticket?.ticketId ?? '');
        const promptId = `wake-${randomUUID()}`;
        // The session is run first, because a resume replays a checkpoint and a session that never
        // stepped has none. Suspending is what makes the answer wait for a wake rather than being
        // folded in where it lands.
        await agentSessionRun({sessionId, workerId, prompt: 'Work the ticket.'}, $meta);
        await agentSessionSuspend({sessionId, promptId, reason: 'question'}, $meta);
        // The answer is stored the way a platform's delivery stores it, and nothing else acts on it.
        await agentAnswerAdd(
            {answerId: randomUUID(), promptId, ticketId, sessionId, answerText: 'go on'},
            $meta,
        );
        return {sessionId, ticketId, promptId};
    };
    const wait = async (sessionId: string, until: string, timeoutMs = 10_000): Promise<string> => {
        const deadline = Date.now() + timeoutMs;
        let status = await statusOf(sessionId);
        while (status === until && Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 100));
            status = await statusOf(sessionId);
        }
        return status;
    };
    return {
        testAgentNotify: ({name = 'agent notify'}: {name?: string} = {}) =>
            group(name)([
                async function aWakeResumesASuspendedSessionBeforeTheNextTick(assert: IAssert) {
                    const {sessionId, promptId} = await park(thisHost());
                    assert.equal(await statusOf(sessionId), 'suspended', 'the session is parked');
                    await publish(
                        {
                            channel: 'agent.answer.wake',
                            message: JSON.stringify({sessionId, promptId}),
                        },
                        $meta,
                    );
                    const after = await wait(sessionId, 'suspended');
                    assert.notEqual(
                        after,
                        'suspended',
                        'the wake resumed it without waiting for a tick',
                    );
                },

                async function aWakeForAHostThatDoesNotHoldTheSessionChangesNothing(
                    assert: IAssert,
                ) {
                    // A worker name of this group's own: `another-host` is what the recovery group
                    // scans for, and a session parked under that name is one its scan would find.
                    const {sessionId, promptId} = await park('notify-other-host');
                    await publish(
                        {
                            channel: 'agent.answer.wake',
                            message: JSON.stringify({sessionId, promptId}),
                        },
                        $meta,
                    );
                    await new Promise(resolve => setTimeout(resolve, 1_000));
                    assert.equal(
                        await statusOf(sessionId),
                        'suspended',
                        'a session this host does not hold is left alone',
                    );
                },
            ]),
    };
});
