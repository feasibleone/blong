import {handler, type IMeta} from '@feasibleone/blong';
import type {IAgentToolCall} from '@feasibleone/blong/types';

import {
    AGENT_TOOL_ASK_HUMAN,
    AGENT_TOOL_FINISH,
    AGENT_TOOL_LIST_FILES,
    AGENT_TOOL_READ_FILE,
    AGENT_TOOL_RUN_COMMAND,
    AGENT_TOOL_WRITE_FILE,
    agentToolArgs,
    agentToolString,
} from '../tools.ts';

/**
 * `agent.tool.run` — the one place a tool call reaches an adapter.
 *
 * Both engine modes end here: a step engine returns the calls it wants run, a native engine's tools are
 * these definitions bound to this method, and either way the workspace adapter is the only thing that
 * touches a file or a process (`@@D-710`). Keeping the boundary in one handler is what makes the jail,
 * the command switch and the timeout one implementation rather than one per engine.
 *
 * A refusal the deployment chose — running commands is off — is re-raised as the realm's own error so a
 * caller sees why, instead of a workspace error it cannot act on. Everything else is returned as the
 * tool's result: a tool that failed is something the model has to read and react to, not a session that
 * dies (`@@D-708`).
 */
export interface IAgentToolRunParams {
    ticketId: string;
    sessionId: string;
    call: IAgentToolCall;
    /** The conversation a question is asked in, carried from the claimed ticket. */
    channel?: {platform?: string; account?: string; conversationId?: string};
}

/** The code the workspace adapter reports for a capability the deployment switched off. */
const COMMAND_DISABLED = 'agent.commandDisabled';

const codeOf = (error: unknown): string | undefined =>
    (error as {code?: string} | undefined)?.code ??
    (Array.isArray(error) ? (error[0] as {code?: string} | undefined)?.code : undefined);

export default handler(
    ({
        handler: {
            workspaceFileRead,
            workspaceFileWrite,
            workspaceFileList,
            workspaceCommandRun,
            agentQuestionAsk,
        },
        errors: {errorAgentCommandDisabled},
    }) => ({
        async agentToolRun(
            params: IAgentToolRunParams,
            $meta: IMeta,
        ): Promise<{result: unknown; finished?: boolean}> {
            const {ticketId, call} = params;
            const args = agentToolArgs(call.args);
            switch (call.toolName) {
                case AGENT_TOOL_READ_FILE:
                    return {
                        result: await workspaceFileRead(
                            {ticketId, path: agentToolString(args, 'path') ?? '.'},
                            $meta,
                        ),
                    };
                case AGENT_TOOL_WRITE_FILE:
                    return {
                        result: await workspaceFileWrite(
                            {
                                ticketId,
                                path: agentToolString(args, 'path') ?? '',
                                content: agentToolString(args, 'content') ?? '',
                            },
                            $meta,
                        ),
                    };
                case AGENT_TOOL_LIST_FILES:
                    return {
                        result: await workspaceFileList(
                            {ticketId, path: agentToolString(args, 'path')},
                            $meta,
                        ),
                    };
                case AGENT_TOOL_RUN_COMMAND: {
                    const command = agentToolString(args, 'command') ?? '';
                    const raw = args.args;
                    const argv = Array.isArray(raw) ? raw.map(String) : undefined;
                    try {
                        return {
                            result: await workspaceCommandRun(
                                {
                                    ticketId,
                                    command,
                                    args: argv,
                                    path: agentToolString(args, 'path'),
                                },
                                $meta,
                            ),
                        };
                    } catch (error) {
                        if (codeOf(error) === COMMAND_DISABLED)
                            throw errorAgentCommandDisabled() as never;
                        return {result: {error: String((error as Error)?.message ?? error)}};
                    }
                }
                case AGENT_TOOL_ASK_HUMAN: {
                    const raw = args.options;
                    const answered = (await agentQuestionAsk(
                        {
                            sessionId: params.sessionId,
                            ticketId,
                            question: agentToolString(args, 'question') ?? '',
                            options: Array.isArray(raw) ? raw.map(String) : undefined,
                            // The channel is the ticket's, and it has to survive the tool boundary: a
                            // question parked under a conversation nobody answers in is a question the
                            // answer cannot find (`@@T-574`).
                            platform: params.channel?.platform,
                            account: params.channel?.account,
                            conversationId: params.channel?.conversationId,
                            toolCallId: call.toolCallId,
                        },
                        $meta,
                    )) as {answerText?: string; suspended?: boolean; promptId?: string};
                    return {result: answered};
                }
                case AGENT_TOOL_FINISH:
                    return {
                        result: {summary: agentToolString(args, 'summary') ?? ''},
                        finished: true,
                    };
                default:
                    return {
                        result: {
                            error: `Unknown tool ${call.toolName}; the tools are: read file, write file, list files, run command, ask a human, finish.`,
                        },
                    };
            }
        },
    }),
);
