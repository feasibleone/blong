/**
 * `agent.mastra` — Mastra as a `step` engine, loaded on demand.
 *
 * Nothing imports this module statically: `adapter/server/engine.ts` reaches it through
 * `loadKind('Mastra')` on the first turn an account of that kind answers, which is why a process
 * with no `mastra` account never loads the framework behind it (`@@T-593`).
 */
import type {
    IAgentEngineAccount,
    IAgentMessage,
    IAgentStepRequest,
    IAgentStepResult,
    IAgentToolCall,
    IAgentToolDefinition,
} from '@feasibleone/blong/types';
import {agentLanguageModel} from './agentProvider.ts';

/**
 * Mastra as a `step` engine.
 *
 * Mastra executes the tools it is given, so the ones declared here are stubs: they return nothing,
 * and the calls are read back off the result for the realm to run (`@@D-708`). Nothing the model asks
 * for is performed twice, because nothing is performed here at all.
 *
 * The model is an AI SDK provider instance rather than a route string, so the account's own endpoint
 * and key are what a turn uses — the same `@ai-sdk/openai` client the Vercel kind takes, which keeps
 * one deployment's two engines pointed at one gateway.
 *
 * The transcript is rendered into the prompt: Mastra's message list is its own type and is the one
 * place this adapter is lossy, which is why the realm's neutral transcript — not this rendering — is
 * what a resume replays.
 */
export const mastraPrompt = (history: IAgentMessage[]): string =>
    history
        .filter(message => message.role === 'user' || message.role === 'assistant')
        .map(message =>
            message.role === 'user'
                ? `user: ${message.text}`
                : `assistant: ${message.text ?? '(no text)'}`,
        )
        .join('\n');

/** The calls a Mastra result carries, in either the flat or the payload-nested shape. */
export const mastraToolCalls = (result: unknown): IAgentToolCall[] => {
    const calls = (result as {toolCalls?: Array<Record<string, unknown>>} | undefined)?.toolCalls;
    if (!Array.isArray(calls)) return [];
    return calls.map(call => {
        const payload = (call.payload ?? {}) as {
            toolName?: unknown;
            args?: unknown;
            toolCallId?: unknown;
        };
        const toolName = String(call.toolName ?? payload.toolName ?? 'unknown');
        const args = call.args ?? payload.args;
        const toolCallId = call.toolCallId ?? payload.toolCallId;
        return {
            toolName,
            ...(toolCallId !== undefined && {toolCallId: String(toolCallId)}),
            ...(args !== undefined && {args}),
        };
    });
};

/**
 * Load a Mastra module by name at call time.
 *
 * The specifier is computed, so TypeScript never reads Mastra's declarations — 1.81 publishes d.ts that
 * import its own bundled AI SDK copies and ask them for types they do not declare. The alternative, a
 * global `skipLibCheck`, would hide every other dependency's mistakes to accommodate this one; a
 * computed specifier keeps the blind spot to the single module that has it (`@@F-652`).
 */
const loadMastra = async (specifier: string): Promise<Record<string, unknown>> => import(specifier);

/** The tool definitions as Mastra tools whose `execute` does nothing but satisfy its type. */
export const mastraTools = async (
    tools: IAgentToolDefinition[],
): Promise<Record<string, unknown>> => {
    const {createTool} = (await loadMastra('@mastra/core/tools')) as {
        createTool: (options: unknown) => unknown;
    };
    return Object.fromEntries(
        tools.map(definition => [
            definition.toolName,
            createTool({
                id: definition.toolName,
                description: definition.toolDescription,
                inputSchema: definition.parameters,
                // The realm runs the call; this exists because Mastra's tool type requires one.
                execute: async () => undefined,
            }),
        ]),
    );
};

/** One model turn, with the calls returned rather than run. */
export const mastraStep = async (
    account: IAgentEngineAccount,
    request: IAgentStepRequest,
): Promise<IAgentStepResult> => {
    const {Agent} = (await loadMastra('@mastra/core/agent')) as {
        Agent: new (config: unknown) => {
            generate: (
                prompt: string,
                options: unknown,
            ) => Promise<{text?: string; toolCalls?: unknown[]}>;
        };
    };
    // The same model the `vercel` kind would call: Mastra is another way to drive a turn, not
    // another vocabulary for the endpoint.
    const model = await agentLanguageModel(account);
    const agent = new Agent({
        id: `blong-${account.modelName ?? 'agent'}`,
        name: 'blong-agent',
        instructions: request.instructions,
        model: model as never,
        tools: await mastraTools(request.tools),
        maxSteps: 1,
    });
    const result = await agent.generate(mastraPrompt(request.history), {maxSteps: 1});
    return {
        ...(result.text !== undefined && {text: result.text}),
        toolCalls: mastraToolCalls(result),
        finishReason: 'tool-calls',
    };
};
