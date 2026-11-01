/**
 * `agent.vercel` — the AI SDK as a `step` engine, loaded on demand.
 *
 * Nothing imports this module statically: `adapter/server/engine.ts` reaches it through
 * `loadKind('Vercel')` on the first turn an account of that kind answers, which is why a process
 * with no `vercel` account never loads the SDK behind it (`@@T-593`).
 */
import type {
    IAgentEngineAccount,
    IAgentMessage,
    IAgentStepRequest,
    IAgentStepResult,
    IAgentToolCall,
    IAgentToolDefinition,
} from '@feasibleone/blong/types';
import {agentLanguageModel, agentCallSettings} from './agentProvider.ts';

/**
 * The Vercel AI SDK as a `step` engine.
 *
 * One turn in, tool calls out, nothing executed: the tools are declared **without** `execute`, so the
 * SDK reports the calls it wants instead of running them, and the realm keeps the loop (`@@D-708`).
 * That is the whole reason this adapter can be swapped for another at a session boundary — the
 * transcript the realm checkpoints is the only state either side keeps.
 *
 * The mapping is exported on its own so a test can assert it without a model, a key or a network.
 */
export type VercelMessage = {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: unknown;
};

const toolCallOf = (message: Extract<IAgentMessage, {role: 'assistant'}>): unknown[] =>
    (message.toolCalls ?? []).map(call => ({
        type: 'tool-call',
        toolCallId: call.toolCallId ?? call.toolName,
        toolName: call.toolName,
        input: call.args ?? {},
    }));

/**
 * The neutral transcript as the SDK's model messages.
 *
 * An assistant turn that asked for tools carries both what it said and the calls, in that order,
 * and a tool turn is the result of one of them — the pairing the model needs to continue rather
 * than start over (`@@D-709`).
 */
export const vercelMessages = (history: IAgentMessage[]): VercelMessage[] =>
    history.map(message => {
        switch (message.role) {
            case 'assistant': {
                const calls = toolCallOf(message);
                if (calls.length === 0) return {role: 'assistant', content: message.text ?? ''};
                return {
                    role: 'assistant',
                    content: [
                        ...(message.text ? [{type: 'text', text: message.text}] : []),
                        ...calls,
                    ],
                };
            }
            case 'tool':
                return {
                    role: 'tool',
                    content: [
                        {
                            type: 'tool-result',
                            toolCallId: message.toolCallId ?? message.toolName,
                            toolName: message.toolName,
                            output: {type: 'json', value: message.result},
                        },
                    ],
                };
            case 'system':
                return {role: 'system', content: message.text};
            case 'user':
            default:
                return {role: 'user', content: message.text};
        }
    });

/** The tool definitions as the SDK's `tool()` values, with no `execute` on purpose (`@@D-708`). */
export const vercelTools = async (
    tools: IAgentToolDefinition[],
): Promise<Record<string, unknown>> => {
    const {jsonSchema, tool} = await import('ai');
    return Object.fromEntries(
        tools.map(definition => [
            definition.toolName,
            tool({
                description: definition.toolDescription,
                inputSchema: jsonSchema(definition.parameters as never),
            } as never),
        ]),
    );
};

/**
 * The transcript split into the two places the SDK accepts it.
 *
 * A `system` message inside `messages` is refused ("System messages are not allowed in the prompt or
 * messages fields"), so every system line is joined into `instructions` and the rest stay messages —
 * which is also what keeps the engine's own instruction and the transcript's opening turn from
 * competing for one slot.
 */
export const vercelSplit = (
    history: IAgentMessage[],
): {
    instructions?: string;
    messages: VercelMessage[];
} => {
    const system = history
        .filter(
            (message): message is Extract<IAgentMessage, {role: 'system'}> =>
                message.role === 'system',
        )
        .map(message => message.text)
        .filter(text => text.length > 0);
    return {
        ...(system.length > 0 && {instructions: system.join('\n')}),
        messages: vercelMessages(history.filter(message => message.role !== 'system')),
    };
};

/**
 * A tool call the model wrote as text.
 *
 * A small local model — qwen2.5-coder:14b on Ollama's OpenAI-compatible endpoint is the one that found
 * this — sometimes answers with the call rather than making it:
 *
 * ```json
 * {"name": "writeFile", "arguments": {"path": "DONE.txt", "content": "seen"}}
 * ```
 *
 * The SDK reports `finishReason: 'stop'` and no tool calls, so the realm would end the session at the
 * step where the work was supposed to happen. Reading the call out of the reply is not charity: it is
 * the same `IAgentToolCall`, the realm runs it through the same boundary, and the model's own tools
 * decide what a name may be — one it did not declare is ignored rather than guessed at.
 */
export const vercelSalvage = (
    text: string | undefined,
    tools: IAgentToolDefinition[],
): IAgentToolCall | undefined => {
    if (!text) return undefined;
    const declared = new Set(tools.map(definition => definition.toolName));
    const source = text.replace(/```[a-z]*/gi, '');
    const candidates: string[] = [];
    for (let start = 0; start < source.length; start += 1) {
        if (source[start] !== '{') continue;
        let depth = 0;
        for (let end = start; end < source.length; end += 1) {
            if (source[end] === '{') depth += 1;
            if (source[end] === '}') {
                depth -= 1;
                if (depth === 0) {
                    candidates.push(source.slice(start, end + 1));
                    start = end;
                    break;
                }
            }
        }
    }
    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate) as {
                name?: unknown;
                toolName?: unknown;
                arguments?: unknown;
                args?: unknown;
            };
            const toolName =
                typeof parsed.name === 'string'
                    ? parsed.name
                    : typeof parsed.toolName === 'string'
                      ? parsed.toolName
                      : undefined;
            if (!toolName || !declared.has(toolName)) continue;
            const args = parsed.arguments ?? parsed.args;
            return {toolName, ...(args !== undefined && {args})};
        } catch {
            // Not JSON, or not this shape: the next candidate may be.
        }
    }
    return undefined;
};

/** One model turn through the AI SDK. */
export const vercelStep = async (
    account: IAgentEngineAccount,
    request: IAgentStepRequest,
): Promise<IAgentStepResult> => {
    const {generateText} = await import('ai');
    // The model comes from the account's provider — an OpenAI-compatible endpoint, Anthropic, or a
    // gateway — and the settings from the account's parameters. Nothing here names a vendor.
    const model = await agentLanguageModel(account);
    const split = vercelSplit(request.history);
    const instructions = [request.instructions, split.instructions]
        .filter((text): text is string => typeof text === 'string' && text.length > 0)
        .join('\n');
    const result = await generateText({
        model: model as never,
        ...(instructions && {system: instructions}),
        messages: split.messages as never,
        tools: (await vercelTools(request.tools)) as never,
        ...agentCallSettings(account),
    } as never);
    const calls = (result.toolCalls ?? []) as Array<{
        toolName: string;
        toolCallId?: string;
        input?: unknown;
    }>;
    if (calls.length === 0) {
        const salvaged = vercelSalvage(result.text, request.tools);
        if (salvaged) return {toolCalls: [salvaged], finishReason: result.finishReason};
    }
    return {
        ...(result.text !== undefined && {text: result.text}),
        toolCalls: calls.map(
            (call): IAgentToolCall => ({
                toolName: call.toolName,
                ...(call.toolCallId !== undefined && {toolCallId: call.toolCallId}),
                ...(call.input !== undefined && {args: call.input}),
            }),
        ),
        finishReason: result.finishReason,
    };
};
