/**
 * `orchestrator/settings.ts` — the settings a handler reads from the port it answered on.
 *
 * `this.config` inside a handler is the config of the port the method was dispatched on — the
 * `agent.agentDispatch` slice — and a group closure is handed its own folder's slice instead, so the
 * values a group needs are read here rather than from a folder (`@@F-641`). The defaults are the
 * activation's, repeated rather than imported because a realm does not depend on `blong-gogo` and
 * because a handler must answer with sane values when it is called on a port whose config never
 * merged.
 */
export interface IAgentDispatchSettings {
    /** The method a human question is asked through. */
    questionMethod?: string;
    /** The method a chat turn's answer is sent through. */
    replyMethod?: string;
    /** The engine adapter instance and the account inside it a claim opens a session with. */
    engineAdapter?: string;
    engineAccount?: string;
    /** One pass of the worker. */
    tickMs?: number;
    /** How long a claim holds before another worker may take the ticket. */
    leaseMs?: number;
    /** Renewed well inside the lease, including while a question is parked. */
    heartbeatMs?: number;
    /** How long a question waits before the session is suspended instead. */
    questionTimeoutMs?: number;
    maxSteps?: number;
    maxToolCalls?: number;
    /** The window a chat session stays open, when the persona names none. */
    continuationMinutes?: number;
    /**
     * The personas this deployment ships, keyed by `personaKey`.
     *
     * Declared here rather than under a `persona` block because `this.config` inside a handler is the
     * slice of the port it answered on, and that port is this one (`@@F-641`). `agentPersonaPresetMerge`
     * writes them to the table when they are absent, so a row a person tuned survives a restart
     * (`@@D-726`).
     */
    personaPresets?: Record<string, IAgentPersonaPreset>;
}

/** One shipped persona, as a deployment declares it. */
export interface IAgentPersonaPreset {
    title: string;
    description?: string;
    enabled?: boolean;
    sortOrder?: number;
    engineAdapter?: string;
    engineAccount?: string;
    engineMode?: string;
    provider?: string;
    modelName?: string;
    /** Merged over the account's parameters; written as JSON. */
    parameters?: Record<string, unknown>;
    /** Absent is every tool, `[]` is a toolless persona. */
    tools?: string[];
    disallowedTools?: string[];
    instructions?: string;
    workspaceMode?: 'none' | 'claim';
    maxSteps?: number;
    maxToolCalls?: number;
    continuationMinutes?: number;
    compaction?: 'summarize' | 'prune' | 'restart' | 'off';
    compactionTokens?: number;
    compactionKeep?: number;
    compactionModel?: string;
    greeting?: string;
}

export interface IAgentDispatchPort {
    config?: IAgentDispatchSettings;
    dispatch?: (params: unknown, $meta: unknown) => Promise<unknown>;
    log?: {warn?: (entry: unknown) => void};
}

export const agentSettings = (config: IAgentDispatchSettings | undefined) => ({
    questionMethod: config?.questionMethod ?? 'chat.prompt.ask',
    replyMethod: config?.replyMethod ?? 'chat.out.message.send',
    engineAdapter: config?.engineAdapter ?? 'engine',
    engineAccount: config?.engineAccount ?? '',
    tickMs: config?.tickMs ?? 5_000,
    leaseMs: config?.leaseMs ?? 60_000,
    heartbeatMs: config?.heartbeatMs ?? 20_000,
    questionTimeoutMs: config?.questionTimeoutMs ?? 1_800_000,
    maxSteps: config?.maxSteps ?? 40,
    maxToolCalls: config?.maxToolCalls ?? 12,
    continuationMinutes: config?.continuationMinutes ?? 1440,
    personaPresets: config?.personaPresets ?? {},
});
