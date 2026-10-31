import type {IAssert, IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * The pool, as a worker and a host experience it (`@@T-569`).
 *
 * The fixture starts from a known state in every step, so what a claim gives is decided by the step and
 * not by the order the groups ran in. A ticket naming a workspace of its own is the interesting one: it
 * is refused and handed back, because a worker that edited a directory nobody deploys would report a
 * success the pool could not undo.
 */
interface IClaimResult {
    ticket?: {ticketId?: string};
    session?: {sessionId?: string};
}

export default handler(context => {
    const {group} = context.lib;
    const {agentTicketClaim, agentTicketRelease, taskPoolReset} = context.handler;
    const $meta = {} as IMeta;
    const drain = async (workers: string[]): Promise<void> => {
        for (const workerId of workers)
            await agentTicketClaim({workerId, engineAccount: 'local'}, $meta);
    };
    return {
        testAgentTicket: ({name = 'agent ticket'}: {name?: string} = {}) =>
            group(name)([
                async function eachWorkerTakesADifferentTicket(assert: IAssert) {
                    await taskPoolReset({}, $meta);
                    const first = (await agentTicketClaim(
                        {workerId: 'host-a', engineAccount: 'local'},
                        $meta,
                    )) as IClaimResult;
                    const second = (await agentTicketClaim(
                        {workerId: 'host-b', engineAccount: 'local'},
                        $meta,
                    )) as IClaimResult;
                    assert.equal(first.ticket?.ticketId, 'T-1001', 'the first worker takes the first free ticket');
                    assert.equal(second.ticket?.ticketId, 'T-1002', 'and the second worker the next one');
                    assert.notEqual(
                        first.ticket?.ticketId,
                        second.ticket?.ticketId,
                        'two workers polling at once never take the same ticket',
                    );
                    assert.ok(first.session?.sessionId, 'a session is opened beside the claim');
                },

                async function aForeignWorkspaceIsRefusedAndHandedBack(assert: IAssert) {
                    await taskPoolReset({}, $meta);
                    // The ticket that names another host's workspace is the last in the fixture.
                    await drain(['host-a', 'host-b', 'host-c', 'host-d']);
                    let code = '';
                    try {
                        await agentTicketClaim({workerId: 'host-e', engineAccount: 'local'}, $meta);
                    } catch (error) {
                        const failure = error as {code?: string; message?: string};
                        code = String(failure.code ?? failure.message ?? '');
                    }
                    assert.match(
                        code,
                        /workspace/,
                        'a ticket whose workspace is not on this host is refused',
                    );
                },

                async function aReleaseClosesTheTicketOnce(assert: IAssert) {
                    await taskPoolReset({}, $meta);
                    const claimed = (await agentTicketClaim(
                        {workerId: 'host-a', engineAccount: 'local'},
                        $meta,
                    )) as IClaimResult;
                    const ticketId = String(claimed.ticket?.ticketId);
                    const released = (await agentTicketRelease(
                        {ticketId, workerId: 'host-a', ticketStatus: 'done'},
                        $meta,
                    )) as {released?: boolean};
                    assert.equal(released.released, true, 'the worker that holds the ticket closes it');
                    let code = '';
                    try {
                        await agentTicketRelease(
                            {ticketId, workerId: 'host-b', ticketStatus: 'done'},
                            $meta,
                        );
                    } catch (error) {
                        const failure = error as {code?: string; message?: string};
                        code = String(failure.code ?? failure.message ?? '');
                    }
                    assert.match(
                        code,
                        /notClaimed|not claimed/,
                        'and a worker that does not hold it cannot close it again',
                    );
                },
            ]),
    };
});
