/**
 * agent.ts — the contract between an engine adapter and the `agent` realm.
 *
 * A session names its mode, because the engines do not agree about who owns the loop (`@@D-708`): a
 * `step` engine answers one model turn and returns the tool calls it wants run, while a `native`
 * engine runs the whole loop itself and reports what it did. Both are described here once, so an
 * engine implementation in `blong-gogo` never has to import the realm and the realm never imports a
 * vendor SDK.
 *
 * The transcript is engine-neutral on purpose: it is what the realm checkpoints, and replaying it is
 * what lets a session resume on a different host or a different engine (`@@D-709`).
 */

/** Who owns the tool loop: the realm (`step`) or the engine (`native`). */
export type AgentEngineMode = 'step' | 'native';

/** The engine implementations one process can carry. `sim` replays a script and needs no network. */
export type AgentEngineKind = 'vercel' | 'mastra' | 'deepseek' | 'sim';

/**
 * One engine account, as the configuration carries it.
 *
 * The alias is the key of the map, so the same model configured twice under two names is two
 * accounts rather than one field. `kind` picks the implementation and `mode` says who drives the
 * loop; an account that names neither mode takes the implementation's own default (`@@D-708`).
 */
export interface IAgentEngineAccount {
    kind: AgentEngineKind;
    modelName?: string;
    apiKey?: string;
    /**
     * Where the key is kept in a deployment: the name of the environment variable carrying it, which
     * a container fills from a Secret (`@@T-578`). Read only when `apiKey` is absent, so a checkout
     * that names the key in its rc file keeps working without one.
     */
    apiKeyEnv?: string;
    /** The API base this account calls — a vendor, or a simulator's address. */
    baseUrl?: string;
    /**
     * The wire format this account speaks: `kind` says who drives the loop, this says what the model
     * answers in (`@@D-723`).
     *
     * `openai` is the OpenAI chat-completions shape, and it is what most services publish as their
     * compatible endpoint — OpenAI itself, Azure, Ollama, vLLM, LM Studio, OpenRouter, Groq, Together,
     * Mistral, DeepSeek, xAI, Gemini's compatibility base, and Anthropic's. `anthropic` and `gateway`
     * are the native ones, and each needs the provider package installed beside `ai`; an account that
     * names one without it fails alone, exactly as an engine kind does (`@@D-700`).
     *
     * Unset is inferred: `anthropic` for a base URL or model name that says so, otherwise `openai`.
     */
    provider?: AgentEngineProvider;
    /** Extra request headers — Azure's `api-key` and `api-version` arrive this way. */
    headers?: Record<string, string>;
    /** The OpenAI organisation and project an account bills to. */
    organization?: string;
    project?: string;
    maxOutputTokens?: number;
    temperature?: number;
    /**
     * How hard the model thinks, where the provider has a notion of it.
     *
     * Reaches the AI SDK as its own `reasoning` setting, which translates per provider: OpenAI-style
     * effort, Anthropic's thinking budget. `none` and `provider-default` are the two values every
     * provider understands.
     */
    reasoningEffort?: string;
    /**
     * Anything else the call takes, merged last: `topP`, `seed`, `stopSequences`, `frequencyPenalty`,
     * `providerOptions` (the per-provider bag), and the rest of the AI SDK's call settings.
     *
     * Last, so an account that names `parameters.reasoning` keeps it over `reasoningEffort` — the
     * escape hatch wins over the shortcut.
     */
    parameters?: Record<string, unknown>;
    mode?: AgentEngineMode;
    /** The directory DeepSeek Harness keeps its own session store in (`@@D-711`). */
    dshHome?: string;
    /** The `dsh` executable this account spawns, when it is not the one on the path. */
    dshBin?: string;
    /** The dialogue a `sim` account replays, one entry per turn. */
    script?: IAgentScriptEntry[];
}

/** The wire formats a model account may speak (`@@D-723`). */
export type AgentEngineProvider = 'openai' | 'anthropic' | 'gateway';

/** One line of a scripted dialogue. */
export type IAgentScriptEntry =
    | {text: string; finishReason?: string}
    | {toolCall: {toolName: string; args?: unknown; toolCallId?: string}; text?: string};

/** A tool the model is allowed to call, in the neutral (TypeBox-derived) schema. */
export interface IAgentToolDefinition {
    toolName: string;
    toolDescription: string;
    parameters: unknown;
}

/** A tool call the model asked for, which the realm is expected to run. */
export interface IAgentToolCall {
    toolName: string;
    toolCallId?: string;
    args?: unknown;
}

/**
 * One turn of the conversation.
 *
 * `tool` carries the result of a call the realm ran, so a replay is self-describing: an engine can
 * rebuild its own view of the conversation from the transcript alone, which is what makes the
 * transcript the checkpoint rather than a debug artefact (`@@D-709`).
 */
export type IAgentMessage =
    | {role: 'system'; text: string}
    | {role: 'user'; text: string}
    | {role: 'assistant'; text?: string; toolCalls?: IAgentToolCall[]}
    | {role: 'tool'; toolName: string; toolCallId?: string; result: unknown};

/** What a `step` engine is asked for: one turn, with the tools it may name. */
export interface IAgentStepRequest {
    /** The account alias, not the kind: one process may hold two accounts of one kind. */
    account: string;
    instructions: string;
    history: IAgentMessage[];
    tools: IAgentToolDefinition[];
}

/** What a `step` engine answers: what it said, and the calls it wants run. Nothing is executed. */
export interface IAgentStepResult {
    text?: string;
    toolCalls: IAgentToolCall[];
    finishReason?: string;
}

/** What a `native` engine is asked for: a prompt and the tools it may use on its own. */
export interface IAgentSessionRequest {
    account: string;
    prompt: string;
    tools: IAgentToolDefinition[];
    /** The engine's own session, when the caller is resuming rather than starting (`@@D-711`). */
    sessionKey?: string;
    /** The directory the engine works in — the ticket's workspace. */
    workspacePath?: string;
}

/** What a `native` engine answers, once its loop has gone idle. */
export interface IAgentSessionResult {
    text?: string;
    /** The engine's session id, stored so a later resume can name it (`@@D-711`). */
    sessionKey?: string;
    finishReason?: string;
    /** Lines the engine reported, for the realm's event log. */
    events?: Array<{kind: string; payload?: unknown}>;
}
