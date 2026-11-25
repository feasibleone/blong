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

import type {VocabularyProxy} from '@feasibleone/blong/types';
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
    /**
     * Whether a session may run commands.
     *
     * A step engine's `runCommand` is refused by the workspace adapter's own `shell.enabled`; a native
     * engine runs its own shell, so the same statement is made here and handed to the engine
     * (`@@D-974`). A deployment that disables one disables both.
     */
    shellEnabled?: boolean;
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
    /**
     * Where a session's telemetry goes (`@@D-988`).
     *
     * `kafka` wherever a broker exists, which is dev, CI and every deployment; `memory` is the test
     * instrument a Playwright run chooses so it needs no broker at all.
     */
    telemetry?: {
        source?: 'kafka' | 'memory';
        /** The Kafka instance this realm publishes through, and the topic it names. */
        adapter?: string;
        topic?: string;
    };
    /**
     * The wake-up channel, when a broker is deployed (`@@D-709`).
     *
     * `channel` empty is a deployment with no subscription: the tick is the mechanism and a wake only
     * shortens the wait, so a realm with no broker must start and run without one. `adapter` is the
     * instance the channel is watched through — the subscription is opened by the orchestrator, which
     * is the layer that decides what a message means (`@@T-816`).
     */
    wake?: {
        adapter?: string;
        channel?: string;
        /** The realm method one wake is dispatched to. */
        method?: string;
    };
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
    /** The component's level face, still used where a line has no declared identifier yet. */
    log?: {warn?: (entry: unknown) => void};
    /**
     * The layer's declared vocabulary (`@@T-717`).
     *
     * A handler's `port` is this whole object; the declaration lives in `lukaot/signal.ts` and
     * `lukaot/error.ts`, and every call site writes `?.` because a realm loaded without the layer has no
     * vocabulary rather than an empty one.
     */
    signal?: VocabularyProxy;
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
    shellEnabled: config?.shellEnabled ?? true,
    maxSteps: config?.maxSteps ?? 40,
    maxToolCalls: config?.maxToolCalls ?? 12,
    continuationMinutes: config?.continuationMinutes ?? 1440,
    personaPresets: config?.personaPresets ?? {},
    telemetry: {
        source: config?.telemetry?.source ?? 'kafka',
        adapter: config?.telemetry?.adapter ?? 'kafka',
        // `<topicPrefix>.<namespace>.<feed>`, which is what the adapter's own guard expects (`D-990`).
        topic: config?.telemetry?.topic ?? 'blong.agent.telemetry',
    },
    wake: {
        adapter: config?.wake?.adapter ?? 'notify',
        // Empty by default: the channel is a deployment's, and a realm with no broker subscribes to
        // nothing rather than to a channel nobody publishes on.
        channel: config?.wake?.channel ?? '',
        method: config?.wake?.method ?? 'agent.answer.wake',
    },
});
