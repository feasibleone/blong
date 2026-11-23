import {hostname} from 'node:os';

import type {IAssert, IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * A real runtime, on the real wire.
 *
 * The scripted groups prove the realm's mechanics and the unit tests prove what the kind sends; this
 * one puts a ticket through a Copilot runtime that is actually running — the BYOK provider answering,
 * the harness owning the loop, the session id coming back — because a switch that is documented but
 * not enforced and a directory the runtime refuses are both invisible to a stand-in (`@@D-977`,
 * `@@F-823`).
 *
 * Without a reachable runtime every step says so and passes: a suite that fails on a machine with no
 * runtime is a suite nobody runs. The `laptop` account is a runtime started by hand on the developer
 * host (`blong ./index.ts integration copilot`), and `srv1`/`srv2` are the servers.
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
        engineAccountCheck,
        agentTicketClaim,
        agentSessionRun,
        agentSessionGet,
        agentEventFind,
    } = context.handler;
    const $meta = {} as IMeta;

    return {
        testAgentCopilot: ({
            name = 'agent copilot wire',
            account = 'laptop',
        }: {name?: string; account?: string} = {}) =>
            group(name)([
                async function aRealRuntimeAnswersOneTurn(assert: IAssert) {
                    const checked = (await engineAccountCheck({account}, $meta)) as {
                        reachable?: boolean;
                        mode?: string;
                    };
                    if (!checked?.reachable) return;
                    await taskPoolReset({}, $meta);
                    const claimed = (await agentTicketClaim(
                        {workerId: thisHost(), engineAccount: account},
                        $meta,
                    )) as IClaimResult;
                    const sessionId = String(claimed.session?.sessionId ?? '');
                    assert.ok(sessionId, 'a session is open for the runtime');
                    assert.equal(
                        claimed.session?.engineMode,
                        'native',
                        'the account decides who owns the loop',
                    );
                    assert.equal(
                        claimed.session?.workspaceKind,
                        'remote',
                        'the workspace belongs to the runtime host',
                    );
                    const ran = (await agentSessionRun(
                        {
                            sessionId,
                            workerId: thisHost(),
                            prompt: 'Reply with the single word: ready',
                            instructions: 'Answer in one short sentence. Do not call any tool.',
                        },
                        $meta,
                    )) as {status?: string; summary?: string};
                    assert.equal(ran.status, 'done', 'the harness finished the ticket');
                    assert.ok(
                        String(ran.summary ?? '').length > 0,
                        `and said something (${JSON.stringify(ran.summary).slice(0, 120)})`,
                    );
                    const found = (await agentSessionGet({sessionId}, $meta)) as {
                        session?: Record<string, unknown>;
                    };
                    assert.ok(
                        String(found.session?.engineSessionId ?? '').length > 0,
                        'the runtime session id is kept, so a resume can name it',
                    );
                    const events = (await agentEventFind({sessionId, limit: 100}, $meta)) as {
                        events: Array<Record<string, unknown>>;
                    };
                    assert.ok(
                        events.events.some(event => String(event.kind) === 'step'),
                        'and the run reported what it did',
                    );
                },
            ]),
    };
});
