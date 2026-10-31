import type {IAssert, IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * The workspace, as a model reaches it: through the one tool boundary (`@@T-573`).
 *
 * Every step calls `agent.tool.run`, which is what a model calls, rather than the adapter underneath
 * it. That is the layer that decides a command is refused when the deployment disabled it, and the
 * layer a jail has to hold under, so a test of the adapter's own jail would prove the wrong thing.
 */
interface IClaimResult {
    ticket?: {ticketId?: string};
    session?: {sessionId?: string};
}

export default handler(context => {
    const {group} = context.lib;
    const {agentTicketClaim, agentToolRun, taskPoolReset} = context.handler;
    const $meta = {} as IMeta;
    const claim = async (): Promise<{ticketId: string; sessionId: string}> => {
        await taskPoolReset({}, $meta);
        const claimed = (await agentTicketClaim(
            {workerId: 'host-w', engineAccount: 'local'},
            $meta,
        )) as IClaimResult;
        return {
            ticketId: String(claimed.ticket?.ticketId ?? ''),
            sessionId: String(claimed.session?.sessionId ?? ''),
        };
    };
    const refuse = async (run: unknown): Promise<string> => {
        try {
            await run;
            return '';
        } catch (error) {
            const failure = error as {code?: string; message?: string};
            return String(failure.code ?? failure.message ?? '');
        }
    };
    return {
        testAgentWorkspace: ({name = 'agent workspace'}: {name?: string} = {}) =>
            group(name)([
                async function aFileIsWrittenAndReadBackThroughTheTool(assert: IAssert) {
                    const {ticketId, sessionId} = await claim();
                    const written = (await agentToolRun(
                        {
                            ticketId,
                            sessionId,
                            call: {
                                toolName: 'writeFile',
                                args: {path: 'notes.txt', content: 'written by the tool'},
                            },
                        },
                        $meta,
                    )) as {result?: unknown};
                    assert.ok(written.result, 'the write answers a result');
                    const read = (await agentToolRun(
                        {
                            ticketId,
                            sessionId,
                            call: {toolName: 'readFile', args: {path: 'notes.txt'}},
                        },
                        $meta,
                    )) as {result?: {content?: string} | string};
                    const content =
                        typeof read.result === 'string'
                            ? read.result
                            : String((read.result as {content?: string})?.content ?? '');
                    assert.match(content, /written by the tool/, 'and the file comes back as written');
                },

                async function aPathThatLeavesTheWorkspaceIsRefused(assert: IAssert) {
                    const {ticketId, sessionId} = await claim();
                    const code = await refuse(
                        agentToolRun(
                            {
                                ticketId,
                                sessionId,
                                call: {toolName: 'readFile', args: {path: '../../etc/passwd'}},
                            },
                            $meta,
                        ),
                    );
                    assert.match(
                        code,
                        /workspaceEscape|leaves the workspace/,
                        'a path that walks out of the workspace is refused by the jail',
                    );
                },

                async function aCommandRunsInTheTicketDirectory(assert: IAssert) {
                    const {ticketId, sessionId} = await claim();
                    const ran = (await agentToolRun(
                        {
                            ticketId,
                            sessionId,
                            call: {toolName: 'runCommand', args: {command: 'echo', args: ['hello']}},
                        },
                        $meta,
                    )) as {result?: {stdout?: string; output?: string} | string};
                    const result = ran.result;
                    const output =
                        typeof result === 'string'
                            ? result
                            : String(
                                  (result as {stdout?: string; output?: string})?.stdout ??
                                      (result as {output?: string})?.output ??
                                      '',
                              );
                    assert.match(output, /hello/, 'the command ran and its output came back');
                },
            ]),
    };
});
