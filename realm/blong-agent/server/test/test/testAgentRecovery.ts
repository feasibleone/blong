import {randomUUID} from 'node:crypto';
import {hostname} from 'node:os';

import type {IAssert, IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * What a host does with the sessions it left suspended (`@@T-575`).
 *
 * The scan is the only path where a person decides what happens to a half-finished session, so the
 * answer is what the branch turns on: the question method the integration run points at answers a choice
 * with its first option, which is `resume`. The other half of the rule is the one that keeps a host from
 * touching work it does not hold: a scan names its own worker, and a session somebody else ran is not
 * its business.
 */
interface ITickResult {
    sessionId?: string;
    status?: string;
}

const thisHost = (): string => process.env.HOSTNAME ?? hostname();

export default handler(context => {
    const {group} = context.lib;
    const {
        agentWorkerTick,
        agentSessionGet,
        agentSessionSuspend,
        agentRecoveryScan,
        taskPoolReset,
    } = context.handler;
    const $meta = {} as IMeta;
    const statusOf = async (sessionId: string): Promise<string> => {
        const found = (await agentSessionGet({sessionId}, $meta)) as {
            session?: Record<string, unknown>;
        };
        return String(found.session?.status ?? '');
    };
    const suspendOne = async (account = 'local'): Promise<string> => {
        await taskPoolReset({}, $meta);
        const tick = (await agentWorkerTick(
            {workerId: thisHost(), engineAccount: account},
            $meta,
        )) as ITickResult;
        const sessionId = String(tick.sessionId);
        await agentSessionSuspend(
            {sessionId, promptId: `scan-${randomUUID()}`, reason: 'question'},
            $meta,
        );
        return sessionId;
    };
    return {
        testAgentRecovery: ({name = 'agent recovery'}: {name?: string} = {}) =>
            group(name)([
                async function aConfirmedSessionIsResumed(assert: IAssert) {
                    const sessionId = await suspendOne();
                    const scanned = (await agentRecoveryScan({workerId: thisHost()}, $meta)) as {
                        scanned?: number;
                        resumed?: number;
                        decisions?: string[];
                    };
                    assert.ok((scanned.scanned ?? 0) >= 1, 'the suspended session is found');
                    assert.ok(
                        (scanned.resumed ?? 0) >= 1,
                        `and the confirmation resumes it (said: ${String(scanned.decisions?.join(',') ?? 'nothing')})`,
                    );
                    assert.notEqual(
                        await statusOf(sessionId),
                        'suspended',
                        'the session is no longer waiting',
                    );
                },

                async function aRefusedSessionIsPurgedAndItsTicketClosed(assert: IAssert) {
                    // Two claims, so the session under test is the one on `T-1002` — the ticket the stub
                    // answers `purge` for.
                    await taskPoolReset({}, $meta);
                    await agentWorkerTick({workerId: thisHost(), engineAccount: 'local'}, $meta);
                    const tick = (await agentWorkerTick(
                        {workerId: thisHost(), engineAccount: 'local'},
                        $meta,
                    )) as ITickResult;
                    const sessionId = String(tick.sessionId);
                    await agentSessionSuspend(
                        {sessionId, promptId: `purge-${randomUUID()}`, reason: 'question'},
                        $meta,
                    );
                    const scanned = (await agentRecoveryScan({workerId: thisHost()}, $meta)) as {
                        purged?: number;
                        decisions?: string[];
                    };
                    assert.ok(
                        (scanned.purged ?? 0) >= 1,
                        `a purged decision removes the workspace and closes the ticket (said: ${String(scanned.decisions?.join(',') ?? '')})`,
                    );
                    assert.equal(
                        await statusOf(sessionId),
                        'failed',
                        'and the session records the attempt as failed',
                    );
                },

                async function aSessionAnotherHostRanIsNotTouched(assert: IAssert) {
                    const sessionId = await suspendOne();
                    const scanned = (await agentRecoveryScan(
                        {workerId: 'another-host'},
                        $meta,
                    )) as {
                        scanned?: number;
                        resumed?: number;
                    };
                    assert.equal(
                        scanned.scanned,
                        0,
                        'a scan only looks at the sessions its own worker left',
                    );
                    assert.equal(
                        await statusOf(sessionId),
                        'suspended',
                        'and the one another host holds stays suspended',
                    );
                },
            ]),
    };
});
