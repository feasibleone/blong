import {hostname} from 'node:os';

import type {IAssert, IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

import type {IAgentSessionRunResult} from '../../../orchestrator/session/agentSessionRun.ts';

/**
 * A native session that parks, on a workspace a runtime host owns.
 *
 * A step engine parks because its transcript says so; a native engine owns its own loop, so the realm
 * only learns of the question from the result and must (a) keep the engine session id, (b) leave a
 * checkpoint a resume can read, and (c) not release the ticket (`@@D-976`). The `parking` account is a
 * script, so all of that is observable without a runtime, a key or a network.
 *
 * The same account names a `workspaceRoot`, which is what makes the claim record a remote path and
 * leave the local workspace adapter alone (`@@D-978`).
 */
interface IClaimResult {
    ticket?: {ticketId?: string};
    session?: Record<string, unknown>;
}

const thisHost = (): string => process.env.HOSTNAME ?? hostname();

export default handler(context => {
    const {group} = context.lib;
    const {
        taskPoolReset,
        agentTicketClaim,
        agentSessionRun,
        agentSessionResume,
        agentSessionGet,
        agentSessionFind,
        agentCheckpointLastGet,
        agentEventFind,
    } = context.handler;
    const $meta = {} as IMeta;
    const sessionOf = async (sessionId: string): Promise<Record<string, unknown>> => {
        const found = (await agentSessionGet({sessionId}, $meta)) as {
            session?: Record<string, unknown>;
        };
        return found.session ?? {};
    };
    const kinds = async (sessionId: string): Promise<string[]> => {
        const found = (await agentEventFind({sessionId, limit: 100}, $meta)) as {
            events: Array<Record<string, unknown>>;
        };
        return found.events.map(event => String(event.kind));
    };
    /** A session this host left, so a step does not depend on an id the previous one held in memory. */
    const latest = async (status?: string): Promise<string | undefined> => {
        const found = (await agentSessionFind(
            {workerId: thisHost(), ...(status && {status}), limit: 1},
            $meta,
        )) as {sessions?: Array<Record<string, unknown>>};
        const session = found.sessions?.[0];
        return session ? String(session.sessionId) : undefined;
    };
    // The claim in the first step is the session every later step works; looking up the newest row
    // instead would race the other groups, whose claims land in the same second.
    let claimedSessionId: string | undefined;

    return {
        testAgentNative: ({name = 'agent native session'}: {name?: string} = {}) =>
            group(name)([
                async function aNativeClaimRecordsARemoteWorkspace(assert: IAssert) {
                    await taskPoolReset({}, $meta);
                    const claimed = (await agentTicketClaim(
                        {workerId: thisHost(), engineAccount: 'parking'},
                        $meta,
                    )) as IClaimResult;
                    const session = claimed.session ?? {};
                    assert.equal(
                        session.engineMode,
                        'native',
                        'the account decides who owns the loop',
                    );
                    assert.equal(
                        session.workspaceKind,
                        'remote',
                        'the workspace belongs to a runtime host',
                    );
                    assert.equal(
                        session.workspacePath,
                        '/srv/blong-agent/workspaces',
                        'and it is the folder the runtime host keeps, which the runtime requires to exist',
                    );
                    claimedSessionId = String(session.sessionId ?? '');
                },

                async function theRunParksAndKeepsItsSessionId(assert: IAssert) {
                    const sessionId = String(claimedSessionId ?? (await latest()) ?? '');
                    assert.ok(sessionId, 'the claim left a session to run');
                    const ran = (await agentSessionRun(
                        {sessionId, workerId: thisHost(), prompt: 'Work the ticket.'},
                        $meta,
                    )) as IAgentSessionRunResult;
                    assert.equal(
                        ran.status,
                        'suspended',
                        'an unanswered question suspends the session',
                    );
                    assert.equal(ran.promptId, 'parking-1', 'with the prompt the engine parked on');
                    const row = await sessionOf(sessionId);
                    assert.equal(row.status, 'suspended', 'and the row says so');
                    assert.equal(
                        row.engineSessionId,
                        `sim-parking|${String(row.workspacePath)}`,
                        'the engine session id is kept, so the resume names the same session',
                    );
                    assert.ok(
                        (await kinds(sessionId)).includes('suspend'),
                        'a suspend event is recorded',
                    );
                },

                async function theParkedQuestionIsInACheckpoint(assert: IAssert) {
                    const sessionId = String(claimedSessionId ?? (await latest('suspended')) ?? '');
                    assert.ok(sessionId, 'the previous step left a suspended session');
                    const last = (await agentCheckpointLastGet({sessionId}, $meta)) as {
                        checkpoint?: Record<string, unknown>;
                    };
                    assert.equal(
                        last.checkpoint?.pendingPromptId,
                        'parking-1',
                        'the checkpoint names the question a resume answers',
                    );
                    assert.equal(
                        last.checkpoint?.pendingQuestionText,
                        'Which fix do you want?',
                        'and carries its text, because a native engine has no transcript to replay',
                    );
                },

                async function theAnswerContinuesTheSameSession(assert: IAssert) {
                    const sessionId = String(claimedSessionId ?? (await latest('suspended')) ?? '');
                    assert.ok(sessionId, 'there is a suspended session to resume');
                    const before = await sessionOf(sessionId);
                    const ran = (await agentSessionResume(
                        {
                            sessionId,
                            workerId: thisHost(),
                            answer: {promptId: 'parking-1', answerText: 'the second one'},
                        },
                        $meta,
                    )) as IAgentSessionRunResult;
                    assert.equal(ran.status, 'done', 'the answer finishes the ticket');
                    assert.equal(ran.summary, 'Applied the answer.', 'with what the run concluded');
                    const after = await sessionOf(sessionId);
                    // The release is what closes a row, and other groups claim from the same pool in
                    // parallel, so the terminal status is not this step's to assert: what the resume
                    // must leave behind is a session that is no longer parked (`@@D-976`).
                    assert.ok(
                        after.status !== 'suspended',
                        `the row is no longer suspended (${String(after.status)})`,
                    );
                    assert.equal(
                        after.engineSessionId,
                        before.engineSessionId,
                        'the resume named the same engine session',
                    );
                    const seen = await kinds(sessionId);
                    assert.ok(seen.includes('resume'), 'a resume event is recorded');
                },
            ]),
    };
});
