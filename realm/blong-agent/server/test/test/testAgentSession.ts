import {randomUUID} from 'node:crypto';
import {hostname} from 'node:os';

import type {IAssert, IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * The session, as the worker and the answer path experience it.
 *
 * Every step drives the realm's own methods — a tick claims and runs, an answer is delivered the way a
 * platform delivers one — and reads the session, its checkpoints and its events afterwards. That is the
 * contract a deployment and a person behind `blong-chat` share, so the test asserts on the rows rather
 * than on what a handler returned on the way (`@@T-570`).
 *
 * The engine is the `sim` account: the three turns and the tool calls are a script, so the loop,
 * the checkpoint-per-step and the human question are observable without a key or a network.
 */
interface ITickResult {
    claimed?: boolean;
    status?: string;
    steps?: number;
    sessionId?: string;
    resumed?: number;
}

const thisHost = (): string => process.env.HOSTNAME ?? hostname();

export default handler(context => {
    const {group} = context.lib;
    const {
        agentWorkerTick,
        agentSessionGet,
        agentSessionFind,
        agentSessionSuspend,
        agentAnswerReceive,
        agentAnswerAdd,
        agentCheckpointLastGet,
        agentEventFind,
        taskPoolReset,
    } = context.handler;
    const $meta = {} as IMeta;
    const kinds = async (sessionId: string): Promise<string[]> => {
        const found = (await agentEventFind({sessionId, limit: 100}, $meta)) as {
            events: Array<Record<string, unknown>>;
        };
        return found.events.map(event => String(event.kind));
    };
    const statusOf = async (sessionId: string): Promise<string> => {
        const found = (await agentSessionGet({sessionId}, $meta)) as {
            session?: Record<string, unknown>;
        };
        return String(found.session?.status ?? '');
    };
    /** The session the previous step left, when no ticket was left to claim. */
    const latestSessionId = async (): Promise<string | undefined> => {
        // This host's own session: the ticket group leaves sessions behind under other worker ids, and
        // a session that belongs elsewhere is one this host cannot suspend or answer.
        const found = (await agentSessionFind({workerId: thisHost(), limit: 1}, $meta)) as {
            sessions: Array<Record<string, unknown>>;
        };
        const session = found.sessions?.[0];
        return session ? String(session.sessionId) : undefined;
    };
    return {
        testAgentSession: ({name = 'agent session'}: {name?: string} = {}) =>
            group(name)([
                // A probe rather than an assertion about the realm: it says whether the persistence
                // handlers answer at all, which is what separates a registration problem from a
                // dispatch one when a step below cannot find one (`@@T-570`).
                async function thePersistenceHandlersAnswer(assert: IAssert) {
                    // Each group starts from the fixture's own first ticket, so the order the groups run
                    // in cannot decide what a claim gets.
                    await taskPoolReset({}, $meta);
                    const found = (await agentSessionFind({limit: 1}, $meta)) as {
                        sessions?: unknown[];
                    };
                    assert.ok(Array.isArray(found.sessions), 'agent.session.find answers a list');
                },

                async function aTickClaimsARunsAndCheckpointsEveryStep(assert: IAssert) {
                    const tick = (await agentWorkerTick(
                        {workerId: thisHost(), engineAccount: 'local'},
                        $meta,
                    )) as ITickResult;
                    assert.equal(tick.claimed, true, 'a free ticket is claimed');
                    assert.equal(tick.status, 'done', 'and the session finishes');
                    assert.equal(tick.steps, 3, 'the sim drove three turns');
                    assert.equal(
                        await statusOf(tick.sessionId!),
                        'done',
                        'the session row says so',
                    );
                    const seen = await kinds(tick.sessionId!);
                    assert.equal(
                        seen.filter(kind => kind === 'step').length,
                        3,
                        'one step event per turn',
                    );
                    assert.equal(
                        seen.filter(kind => kind === 'tool').length,
                        2,
                        'one tool event per call the model asked for',
                    );
                    const checkpoint = (await agentCheckpointLastGet(
                        {sessionId: tick.sessionId!},
                        $meta,
                    )) as {checkpoint?: Record<string, unknown>};
                    assert.equal(
                        Number(checkpoint.checkpoint?.sequence),
                        3,
                        'a checkpoint follows every step',
                    );
                },

                async function aQuestionIsAnsweredAndTheLoopContinues(assert: IAssert) {
                    const tick = (await agentWorkerTick(
                        {workerId: thisHost(), engineAccount: 'asking'},
                        $meta,
                    )) as ITickResult;
                    assert.equal(tick.claimed, true, 'the second ticket is claimed');
                    assert.equal(
                        tick.status,
                        'done',
                        'the asked question is answered and the loop carries on',
                    );
                    const seen = await kinds(tick.sessionId!);
                    assert.ok(
                        seen.includes('tool'),
                        'the ask reached the tool boundary like any other call',
                    );
                },

                async function anAnswerResumesASuspendedSessionExactlyOnce(assert: IAssert) {
                    // No claim here: the step needs a session to suspend, and a ticket taken for that
                    // would leave the steps below without one. The pool is a fixture, not a factory.
                    const sessionId = await latestSessionId();
                    assert.ok(sessionId, 'a session to suspend exists');
                    // A fresh prompt per run: the answer row is idempotent on this id, and a run that
                    // reused a literal would read the previous run's row as "already stored".
                    const promptId = `prompt-${randomUUID()}`;
                    await agentSessionSuspend(
                        {sessionId: sessionId!, promptId, reason: 'question'},
                        $meta,
                    );
                    assert.equal(
                        await statusOf(sessionId!),
                        'suspended',
                        'the session is suspended',
                    );
                    const first = (await agentAnswerReceive(
                        {
                            promptId,
                            answerText: 'the chosen fix',
                            sessionId: sessionId!,
                        },
                        $meta,
                    )) as {stored?: boolean; resumed?: boolean; reason?: string};
                    assert.equal(first.stored, true, 'the answer is stored');
                    assert.equal(
                        first.resumed,
                        true,
                        `and the host that owns it resumes the session (${first.reason})`,
                    );
                    const second = (await agentAnswerReceive(
                        {
                            promptId,
                            answerText: 'the chosen fix',
                            sessionId: sessionId!,
                        },
                        $meta,
                    )) as {stored?: boolean; resumed?: boolean};
                    assert.equal(second.stored, true, 'a redelivered answer is acknowledged');
                    assert.equal(second.resumed, false, 'and never resumed twice');
                },

                async function aStoredAnswerIsResumedByTheNextTick(assert: IAssert) {
                    await taskPoolReset({}, $meta);
                    const tick = (await agentWorkerTick(
                        {workerId: thisHost(), engineAccount: 'local'},
                        $meta,
                    )) as ITickResult;
                    const sessionId = String(tick.sessionId);
                    const found = (await agentSessionGet({sessionId}, $meta)) as {
                        session?: Record<string, unknown>;
                    };
                    await agentSessionSuspend(
                        {sessionId, promptId: `tick-${randomUUID()}`, reason: 'question'},
                        $meta,
                    );
                    // The row is written the way a platform's answer is, but with no host awake to act
                    // on it: the inbox pass of the next tick is what has to find it (`@@T-571`).
                    await agentAnswerAdd(
                        {
                            answerId: randomUUID(),
                            promptId: `tick-${randomUUID()}`,
                            ticketId: String(found.session?.ticketId ?? ''),
                            sessionId,
                            answerText: 'carry on',
                        },
                        $meta,
                    );
                    const next = (await agentWorkerTick(
                        {workerId: thisHost(), engineAccount: 'local'},
                        $meta,
                    )) as ITickResult;
                    assert.ok(
                        (next.resumed ?? 0) >= 1,
                        'the tick resumes the session whose answer is waiting',
                    );
                    assert.notEqual(
                        await statusOf(sessionId),
                        'suspended',
                        'and the session is no longer suspended',
                    );
                },

                async function aQuestionThatIsNeverAnsweredSuspendsTheSession(assert: IAssert) {
                    const tick = (await agentWorkerTick(
                        {workerId: thisHost(), engineAccount: 'slow'},
                        $meta,
                    )) as ITickResult;
                    assert.equal(
                        tick.claimed,
                        true,
                        'the ticket that asks into the void is claimed',
                    );
                    assert.equal(
                        tick.status,
                        'suspended',
                        'a question nobody answers suspends the session rather than failing it',
                    );
                    assert.ok(
                        (await kinds(tick.sessionId!)).includes('suspend'),
                        'and the suspension is recorded as an event',
                    );
                },

                async function aNativeSessionRecordsItsEngineIdAndEvents(assert: IAssert) {
                    const tick = (await agentWorkerTick(
                        {workerId: thisHost(), engineAccount: 'native'},
                        $meta,
                    )) as ITickResult;
                    assert.equal(tick.claimed, true, 'the native ticket is claimed');
                    assert.equal(tick.status, 'done', 'the engine runs its own loop to the end');
                    const found = (await agentSessionGet({sessionId: tick.sessionId!}, $meta)) as {
                        session?: Record<string, unknown>;
                    };
                    assert.match(
                        String(found.session?.engineSessionId ?? ''),
                        /^sim-/,
                        'the engine session id is stored, which is what a later resume names',
                    );
                    assert.ok(
                        (await kinds(tick.sessionId!)).includes('text'),
                        'the events the engine reported are recorded in the realm',
                    );
                },
            ]),
    };
});
