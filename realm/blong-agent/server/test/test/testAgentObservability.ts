import {randomUUID} from 'node:crypto';
import {hostname} from 'node:os';

import type {IAssert, IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * One tick, and nothing else — the run the observability test reads back (`@@T-718`).
 *
 * The other groups assert what a session *did*; this one exists so a test that is about the log has a
 * tick to look at, and it is one step long so that what it costs is the tick and not a story. It
 * starts from the fixture's first ticket, because a step that depended on what another group left in
 * the pool would pass or fail by the order the groups ran in.
 */
interface ITickResult {
    claimed?: boolean;
    status?: string;
    sessionId?: string;
    resumed?: number;
}

const thisHost = (): string => process.env.HOSTNAME ?? hostname();

export default handler(context => {
    const {group} = context.lib;
    const {agentAnswerAdd, agentSessionSuspend, agentTicketClaim, agentWorkerTick, taskPoolReset} =
        context.handler;
    const $meta = {} as IMeta;
    return {
        testAgentObservability: ({name = 'agent observability'}: {name?: string} = {}) =>
            group(name)([
                async function aTickClaimsOneTicketAndRunsIt(assert: IAssert) {
                    await taskPoolReset({}, $meta);
                    const tick = (await agentWorkerTick(
                        {workerId: thisHost(), engineAccount: 'local'},
                        $meta,
                    )) as ITickResult;
                    assert.equal(tick.claimed, true, 'a free ticket is claimed');
                    assert.equal(tick.status, 'done', 'and its session runs to the end');
                    // No assertion on the step count: the scripted engine is a script, and this group
                    // runs after others that drive it. What the log test needs is a tick that produced
                    // a claim and a session, and that is what is asserted.
                },

                async function aWaitingAnswerIsResumedAndAnnounced(assert: IAssert) {
                    // The inbox pass is the tick's other half, and the resume it performs is the second
                    // thing a session's flow is drawn from — so the test that reads the log has to have
                    // one (`@@T-717`).
                    await taskPoolReset({}, $meta);
                    const first = (await agentWorkerTick(
                        {workerId: thisHost(), engineAccount: 'local'},
                        $meta,
                    )) as ITickResult;
                    const sessionId = String(first.sessionId);
                    const promptId = `resume-${randomUUID()}`;
                    await agentSessionSuspend({sessionId, promptId, reason: 'question'}, $meta);
                    await agentAnswerAdd(
                        {
                            answerId: randomUUID(),
                            promptId,
                            ticketId: '',
                            sessionId,
                            answerText: 'carry on',
                            senderName: 'the person who answered',
                        },
                        $meta,
                    );
                    const next = (await agentWorkerTick(
                        {workerId: thisHost(), engineAccount: 'local'},
                        $meta,
                    )) as ITickResult;
                    assert.ok((next.resumed ?? 0) >= 1, 'the waiting answer is resumed');
                },

                async function aSuspendedSessionWithNoCheckpointIsSkipped(assert: IAssert) {
                    // The claim creates the session row *before* the run writes its first checkpoint, so
                    // a session suspended in between has nothing to replay. A tick that let that stop it
                    // would leave every other waiting answer behind one session that cannot be replayed (`@@T-717`).
                    await taskPoolReset({}, $meta);
                    const claimed = (await agentTicketClaim(
                        {workerId: thisHost(), engineAccount: 'local'},
                        $meta,
                    )) as {session?: {sessionId?: string}};
                    const sessionId = String(claimed.session?.sessionId);
                    const promptId = `orphan-${randomUUID()}`;
                    await agentSessionSuspend({sessionId, promptId, reason: 'question'}, $meta);
                    await agentAnswerAdd(
                        {
                            answerId: randomUUID(),
                            promptId,
                            ticketId: '',
                            sessionId,
                            answerText: 'nobody can replay this',
                        },
                        $meta,
                    );
                    const tick = (await agentWorkerTick(
                        {workerId: thisHost(), engineAccount: 'local'},
                        $meta,
                    )) as ITickResult;
                    assert.equal(tick.resumed, 0, 'the answer nobody can replay is not resumed');
                    assert.ok(
                        tick.claimed === true || tick.claimed === false,
                        'and the tick carries on',
                    );
                },

                async function aTickWithoutAnAccountClaimsNothing(assert: IAssert) {
                    // A configuration mistake must not become a lease the pool waits out: the tick
                    // asks before it takes anything (`@@D-704`).
                    await taskPoolReset({}, $meta);
                    const tick = (await agentWorkerTick(
                        {workerId: thisHost(), engineAccount: ''},
                        $meta,
                    )) as ITickResult & {reason?: string};
                    assert.equal(tick.claimed, false, 'no account, no claim');
                    assert.match(String(tick.reason), /engine account/, 'and it says why');
                },
            ]),
    };
});
