/**
 * `agent.deepseek` — the harness as a `native` engine, loaded on demand.
 *
 * Nothing imports this module statically: `adapter/server/engine.ts` reaches it through
 * `loadKind('Deepseek')` when a session of that kind starts, which is why a process with no
 * `deepseek` account never looks for the harness binary or its client (`@@T-593`).
 */
import type {
    AgentTelemetryKind,
    AgentTelemetryReport,
    IAgentEngineAccount,
    IAgentSessionRequest,
    IAgentSessionResult,
} from '@feasibleone/blong/types';

/**
 * DeepSeek Harness as a `native` engine.
 *
 * The harness owns its loop, so this is not a turn: the client spawns a `dsh` runtime, a prompt runs
 * until the whole agent is idle, and the tools are the harness's own, rooted at the ticket workspace
 * (`@@D-711`). What the realm keeps is the engine's session id — the thing a later resume names — and
 * the text it said, which is what the transcript records.
 *
 * One runtime per account is reused across calls, because spawning it is the expensive part: the
 * module keeps them by account key and `engine.session.close` reaps them. The binary is deployment
 * configuration (`dshBin`), never resolved by this file, so a process that never configures a DeepSeek
 * account never looks for one (`@@D-700`).
 */
type Harness = {
    run: (
        prompt: string,
        options?: {sessionId?: string},
    ) => Promise<{sessionId: string; finalResponse: string; events?: unknown[]}>;
    close: () => Promise<void>;
};

const harnesses = new Map<string, Harness>();

const keyOf = (account: IAgentEngineAccount, workspacePath?: string): string =>
    `${account.dshBin ?? 'dsh'}|${account.dshHome ?? ''}|${workspacePath ?? ''}`;

/**
 * The launch spec a session is spawned with. Pure, so a test can assert it without a runtime.
 *
 * `cwd` is the ticket's workspace: the harness resolves every relative path against it and the
 * sandbox it applies is the boundary this realm relies on (`@@D-711`).
 */
export const deepseekOptions = (
    account: IAgentEngineAccount,
    request: IAgentSessionRequest,
): Record<string, unknown> => ({
    launch: {
        ...(account.dshBin && {dshBin: account.dshBin}),
        ...(account.dshHome && {dshHome: account.dshHome}),
    },
    ...(request.workspacePath && {cwd: request.workspacePath}),
    ...(account.modelName && {model: account.modelName}),
    ...(account.maxOutputTokens !== undefined && {maxTokens: account.maxOutputTokens}),
});

const harnessOf = async (
    account: IAgentEngineAccount,
    request: IAgentSessionRequest,
): Promise<Harness> => {
    const key = keyOf(account, request.workspacePath);
    const existing = harnesses.get(key);
    if (existing) return existing;
    // The specifier is computed so the compiler does not require the package: a deployment without a
    // DeepSeek account carries neither the client nor its runtime (`@@D-700`).
    const moduleName = '@deepseek-ai/dsh-sdk-client';
    const {DeepSeekHarness} = (await import(moduleName)) as {
        DeepSeekHarness: new (options: unknown) => Harness;
    };
    const created = new DeepSeekHarness(deepseekOptions(account, request));
    harnesses.set(key, created);
    return created;
};

/** The kinds a feed carries, so a harness event that names one passes through unchanged. */
const KNOWN_KINDS: Record<string, AgentTelemetryKind> = {
    status: 'status',
    reasoning: 'reasoning',
    message: 'message',
    tool: 'tool',
    'tool-call': 'tool',
    'tool-result': 'tool-result',
    note: 'note',
    // The harness's own spellings of a delta, which are the two the vocabulary renames.
    text: 'message',
    'text-delta': 'message',
    'reasoning-delta': 'reasoning',
};

/**
 * One harness event, as the feed carries it.
 *
 * The harness names its own steps, so a name this vocabulary knows travels as itself, a name it
 * spells differently is translated, and anything else is a `note` — a reader sees that something
 * happened without the framework pretending to understand a shape it does not define.
 */
export const deepseekTelemetry = (
    event: unknown,
): {kind: AgentTelemetryKind; payload?: unknown} | undefined => {
    if (!event || typeof event !== 'object') return undefined;
    const candidate = event as {kind?: unknown; type?: unknown; payload?: unknown};
    const named = typeof candidate.kind === 'string' ? candidate.kind : candidate.type;
    if (typeof named !== 'string') return undefined;
    const kind = KNOWN_KINDS[named];
    return kind ? {kind, payload: candidate.payload ?? event} : {kind: 'note', payload: event};
};

/** One native run. `sessionKey` is what makes the second call a resume rather than a new session. */
export const deepseekSession = async (
    account: IAgentEngineAccount,
    request: IAgentSessionRequest,
    report: AgentTelemetryReport = () => undefined,
): Promise<IAgentSessionResult> => {
    const harness = await harnessOf(account, request);
    const result = await harness.run(request.prompt, {
        ...(request.sessionKey && {sessionId: request.sessionKey}),
    });
    // The harness answers its events with the run rather than through a callback, so the feed gets
    // them in one go after it: the client this kind drives publishes no per-event stream.
    for (const event of result.events ?? []) {
        const mapped = deepseekTelemetry(event);
        if (mapped) report(mapped.kind, mapped.payload);
    }
    if (result.finalResponse) report('message', {text: result.finalResponse});
    report('status', {state: 'finished', text: result.finalResponse});
    return {
        text: result.finalResponse,
        sessionKey: result.sessionId,
        finishReason: 'idle',
    };
};

/** Reap the runtime an account was holding, which is what a session's close means here. */
export const deepseekClose = (account: IAgentEngineAccount, workspacePath?: string): void => {
    const key = keyOf(account, workspacePath);
    const harness = harnesses.get(key);
    if (!harness) return;
    harnesses.delete(key);
    void harness.close().catch(() => undefined);
};
