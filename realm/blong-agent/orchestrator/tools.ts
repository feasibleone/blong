import type {IAgentMessage, IAgentToolDefinition} from '@feasibleone/blong/types';

/**
 * `orchestrator/session/agentTools.ts` — the tools a model may call, in the neutral shape.
 *
 * A definition is a name, a description and a JSON schema, because that is what every engine accepts
 * and what the realm can describe without knowing a vendor (`@@D-708`). The schemas are written by
 * hand rather than derived from TypeBox: the parameters cross a process boundary in an engine's own
 * wire format, and a hand-written schema is the one thing every implementation agrees on.
 *
 * `finish` is a tool rather than a convention: a session that has to stop has to be able to say what it
 * concluded, and "the model stopped talking" is not the same statement.
 */

export const AGENT_TOOL_READ_FILE = 'readFile';
export const AGENT_TOOL_WRITE_FILE = 'writeFile';
export const AGENT_TOOL_LIST_FILES = 'listFiles';
export const AGENT_TOOL_RUN_COMMAND = 'runCommand';
export const AGENT_TOOL_ASK_HUMAN = 'askHuman';
export const AGENT_TOOL_FINISH = 'finish';

const object = (properties: Record<string, unknown>, required: string[] = []) => ({
    type: 'object',
    properties,
    required,
    additionalProperties: false,
});

export const agentToolDefinitions = (): IAgentToolDefinition[] => [
    {
        toolName: AGENT_TOOL_READ_FILE,
        toolDescription: 'Read a text file from the ticket workspace. The path is relative to it.',
        parameters: object({path: {type: 'string', description: 'File path inside the workspace'}}, [
            'path',
        ]),
    },
    {
        toolName: AGENT_TOOL_WRITE_FILE,
        toolDescription:
            'Write a text file in the ticket workspace, replacing what is there. The path is relative ' +
            'to the workspace and may not leave it.',
        parameters: object(
            {
                path: {type: 'string', description: 'File path inside the workspace'},
                content: {type: 'string', description: 'The whole new content of the file'},
            },
            ['path', 'content'],
        ),
    },
    {
        toolName: AGENT_TOOL_LIST_FILES,
        toolDescription: 'List the entries of a directory in the ticket workspace.',
        parameters: object({path: {type: 'string', description: 'Directory, the workspace by default'}}),
    },
    {
        toolName: AGENT_TOOL_RUN_COMMAND,
        toolDescription:
            'Run one command in the ticket workspace. Arguments are passed as a list; no shell is ' +
            'involved. Refused when the deployment disabled running commands.',
        parameters: object(
            {
                command: {type: 'string', description: 'The executable, without arguments'},
                args: {type: 'array', items: {type: 'string'}, description: 'One entry per argument'},
            },
            ['command'],
        ),
    },
    {
        toolName: AGENT_TOOL_ASK_HUMAN,
        toolDescription:
            'Ask the person who opened the ticket a question and wait for the answer. Use it when a ' +
            'decision cannot be inferred from the workspace.',
        parameters: object(
            {
                question: {type: 'string', description: 'The question, in one or two sentences'},
                options: {
                    type: 'array',
                    items: {type: 'string'},
                    description: 'Suggested answers, when the question is a choice',
                },
            },
            ['question'],
        ),
    },
    {
        toolName: AGENT_TOOL_FINISH,
        toolDescription: 'Stop working on the ticket and report what was done, or why nothing was.',
        parameters: object({summary: {type: 'string', description: 'What the session concluded'}}, [
            'summary',
        ]),
    },
];

/** The arguments a model sent, as an object — a model that sent none sent `{}`. */
export const agentToolArgs = (args: unknown): Record<string, unknown> =>
    typeof args === 'object' && args !== null && !Array.isArray(args)
        ? (args as Record<string, unknown>)
        : {};

/** A string argument, or `undefined` when the model left it out or sent another type. */
export const agentToolString = (
    args: Record<string, unknown>,
    key: string,
): string | undefined => (typeof args[key] === 'string' ? (args[key] as string) : undefined);

/**
 * The transcript a checkpoint holds.
 *
 * A column that carries JSON comes back as the text that was written, or already parsed when the
driver recognises the column type — and `String(parsed)` is `[object Object]`, which is a parse error
two files away from the cause. Both shapes are read here, so nothing upstream has to know which.
 */
export const agentHistory = (value: unknown): IAgentMessage[] => {
    if (Array.isArray(value)) return value as IAgentMessage[];
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value || '[]');
            return Array.isArray(parsed) ? (parsed as IAgentMessage[]) : [];
        } catch {
            return [];
        }
    }
    return [];
};
