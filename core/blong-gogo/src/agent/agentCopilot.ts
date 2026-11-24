/**
 * `agent.copilot` — the Copilot harness as a `native` engine, loaded on demand.
 *
 * Nothing imports this module statically: `adapter/server/engine.ts` reaches it through
 * `loadKind('Copilot')` when a session of that kind starts, so a process with no `copilot` account
 * never loads the SDK, its FFI binding or the runtime it attaches to (`@@T-593`, `@@D-970`).
 *
 * The harness owns the loop (`@@D-708`): the client creates or resumes a session on a runtime that
 * runs on another host, sends one prompt and waits for the agent to go idle. The runtime's own tools
 * do the file and shell work (`@@D-974`); the realm's tools that this kind can serve — a question for
 * a person, and the statement that the session is finished — arrive as custom tools whose handlers
 * dispatch back into the realm's tool boundary (`@@D-975`).
 */
import type {
    IAgentEngineAccount,
    IAgentSessionRequest,
    IAgentSessionResult,
    IAgentToolCall,
    IAgentToolDefinition,
} from '@feasibleone/blong/types';
import type {
    CopilotClient,
    CopilotSession,
    CreateSessionOptions,
    ResumeSessionOptions,
    Tool,
} from '@microsoft/copilot-sdk';

import {agentEngineKey} from './agentKey.ts';

/**
 * The realm's tools this kind can serve, in the realm's vocabulary.
 *
 * Everything else a step engine offers — reading, writing, listing, running a command — the harness
 * does itself, against the directory it was given; registering a second set would be two filesystems
 * in one transcript (`@@D-974`).
 */
export const COPILOT_TOOL_NAMES = ['askHuman', 'finish'] as const;

/**
 * The runtime's own command tools, by the names a session may exclude (`@@D-974`).
 *
 * A `coding-agent` session runs its tools as the CLI does with `--allow-all`, and a permission
 * handler is not consulted for the shell: measured against runtime 1.0.114, a session in `manual`
 * mode ran `echo hi` without ever calling `onRequest`. Removing the tools is what makes the
 * deployment's statement true, and the permission handler stays as a second line for a runtime
 * that does consult it.
 */
export const COPILOT_SHELL_TOOLS = ['bash', 'powershell', 'shell'] as const;

/** How this module reaches a handler of the realm it is running in. */
export type CopilotDispatch = (
    params: Record<string, unknown>,
    meta: Record<string, unknown>,
) => Promise<unknown>;

type Sdk = {
    CopilotClient: new (options: Record<string, unknown>) => CopilotClient;
    RuntimeConnection: {forTcp: (host: string, port: number, opts?: object) => object};
    defineTool: (name: string, config: Record<string, unknown>) => Tool;
};

/** The SDK's shape as this module uses it, so a test can hand over a stand-in. */
export type CopilotSdk = Sdk;

/** What a test may substitute for the two things this module would otherwise create itself. */
export interface CopilotDeps {
    sdk?: Sdk;
    client?: CopilotClient;
}

let loaded: Promise<Sdk> | undefined;

/**
 * The SDK, loaded once.
 *
 * A failed load is forgotten rather than cached, so an account that could not be served because the
 * package was missing fails again on the next attempt instead of for the rest of the process.
 */
const sdkOf = async (): Promise<Sdk> => {
    loaded ??= import('@microsoft/copilot-sdk').then(module => module as unknown as Sdk);
    try {
        return await loaded;
    } catch (error) {
        loaded = undefined;
        throw error;
    }
};

const clients = new Map<string, CopilotClient>();
const sessions = new Map<string, CopilotSession>();

/** `host:port`, with a scheme tolerated because a URL in an rc file is easy to write by habit. */
export const copilotEndpoint = (runtimeUrl: string): {host: string; port: number} => {
    const bare = runtimeUrl.replace(/^[a-z+]+:\/\//i, '');
    const at = bare.lastIndexOf(':');
    const port = at > 0 ? Number(bare.slice(at + 1)) : Number.NaN;
    if (!Number.isFinite(port) || port <= 0 || port > 65535)
        throw new Error(`a copilot account's runtimeUrl must be host:port, not ${runtimeUrl}`);
    return {host: bare.slice(0, at), port};
};

const tokenOf = (account: IAgentEngineAccount): string | undefined =>
    agentEngineKey({apiKey: account.runtimeToken, apiKeyEnv: account.runtimeTokenEnv});

/** One client per endpoint; a token change is a different endpoint, because it is a different server. */
const clientKeyOf = (account: IAgentEngineAccount): string =>
    `${account.runtimeUrl ?? ''}|${tokenOf(account) ?? ''}`;

const sessionKeyOf = (account: IAgentEngineAccount, workspacePath?: string): string =>
    `${clientKeyOf(account)}|${workspacePath ?? ''}`;

/**
 * The session's configuration, without anything a call creates or resumes differently.
 *
 * Pure, so a test asserts a spec rather than a runtime — the shape `deepseekOptions` established. The
 * model is required by BYOK and the provider is named `byok`, which is the name
 * `inference.defaultProvider` points at (`@@D-973`).
 */
export const copilotSessionConfig = (
    account: IAgentEngineAccount,
    request: Pick<IAgentSessionRequest, 'instructions' | 'workspacePath'>,
): Record<string, unknown> => {
    const apiKey = agentEngineKey(account);
    const providerType = account.provider === 'anthropic' ? 'anthropic' : 'openai';
    const baseUrl = account.baseUrl ?? 'https://api.openai.com/v1';
    // A 404 from a provider names the model, and the cause is often the wire: an Anthropic-format
    // base URL posted to in the OpenAI shape answers "model not found", which sends its reader after
    // the model name. The mismatch is the account's, so it fails here with a sentence instead.
    if (providerType !== 'anthropic' && /\/anthropic\/?$/.test(baseUrl))
        throw new Error(
            `the copilot account's baseUrl ${baseUrl} is the Anthropic wire; ` +
                `name provider: anthropic to speak it`,
        );
    return {
        ...(account.modelName && {model: account.modelName}),
        // Copilot inference is off and one named provider answers in its place: no GitHub account, no
        // Copilot subscription, and the spend is the provider's (`@@D-973`).
        github: {capi: {enabled: false}},
        inference: {
            defaultProvider: 'byok',
            providers: [
                {
                    name: 'byok',
                    type: providerType,
                    baseUrl,
                    ...(apiKey && {apiKey}),
                    wireApi: 'completions',
                },
            ],
        },
        ...(request.instructions && {
            systemMessage: {mode: 'append', content: request.instructions},
        }),
        ...(request.workspacePath && {workingDirectory: request.workspacePath}),
    };
};

/**
 * The permission decision a deployment's command switch makes (`@@D-974`).
 *
 * The switch itself is the excluded shell tool (`COPILOT_SHELL_TOOLS`), because a `coding-agent`
 * runtime does not consult this handler for the shell. It stays beside it for the runtime that does,
 * and because a session's other requests are worth answering in one place.
 */
export const copilotPermissionFor =
    (allowShell?: boolean): ((permission: {kind?: string}) => {kind: string; feedback?: string}) =>
    permission =>
        permission.kind === 'shell' && allowShell === false
            ? {kind: 'reject', feedback: 'Running commands is disabled for this deployment.'}
            : {kind: 'approve-once'};

/** One tool the runtime may call, whose handler is the realm's tool boundary (`@@D-975`). */
export const copilotToolOf = (
    sdk: Sdk,
    definition: IAgentToolDefinition,
    call: (call: IAgentToolCall) => Promise<{result?: unknown; finished?: boolean}>,
    park: (promptId?: string, question?: string) => void,
): Tool =>
    sdk.defineTool(definition.toolName, {
        description: definition.toolDescription,
        parameters: definition.parameters as Record<string, unknown>,
        // The call is the realm's to interpret, including the question that parks it, so the handler
        // does nothing but hand it over and translate the answer back.
        skipPermission: true,
        handler: async (args: unknown) => {
            const ran = await call({
                toolName: definition.toolName,
                args: args ?? {},
            });
            const result = ran?.result as {suspended?: boolean; promptId?: string} | undefined;
            if (result?.suspended) {
                // The question goes with the suspension, because a native resume states it (`@@D-976`).
                park(result.promptId, (args as {question?: string} | undefined)?.question);
                return {
                    textResultForLlm:
                        'The person has not answered yet. The session is parked until they do.',
                    resultType: 'failure',
                };
            }
            return ran?.finished
                ? {finished: true, ...(result ?? {})}
                : (ran?.result ?? {ok: true});
        },
    });

/**
 * One native run: create or resume a session, hand it the prompt, and report what it did.
 *
 * A question that parks the session aborts the run: the answer arrives at the realm, not at this
 * process, and the resume delivers it as the next user turn (`@@D-976`). The session itself stays on
 * the runtime's disk, so the id returned here is the one a later resume names.
 */
export const copilotSession = async (
    account: IAgentEngineAccount,
    request: IAgentSessionRequest,
    dispatch: CopilotDispatch,
    deps: CopilotDeps = {},
): Promise<IAgentSessionResult> => {
    if (!account.modelName)
        throw new Error(
            `the copilot account ${request.account} needs modelName: BYOK requires a model`,
        );
    const sdk = deps.sdk ?? (await sdkOf());
    const client = deps.client ?? (await clientOf(account));

    const parked: {promptId?: string; question?: string} = {};
    // One object rather than two locals: the session is created after the closures that park it are
    // built, and a holder is what keeps that ordering readable.
    const run: {session?: CopilotSession; aborted: boolean} = {aborted: false};
    const park = (promptId?: string, question?: string): void => {
        parked.promptId = promptId ?? parked.promptId;
        parked.question = question ?? parked.question;
        run.aborted = true;
        void run.session?.abort().catch(() => undefined);
    };
    const toolDispatch = request.toolDispatch;
    const call = async (
        toolCall: IAgentToolCall,
    ): Promise<{result?: unknown; finished?: boolean}> => {
        if (!toolDispatch)
            return {result: {error: 'this session has no tool dispatch to reach the realm'}};
        return (await dispatch(
            {
                ticketId: toolDispatch.ticketId,
                sessionId: toolDispatch.sessionId,
                call: toolCall,
                channel: toolDispatch.channel,
            },
            {...(toolDispatch.meta ?? {}), method: toolDispatch.method, mtid: 'request'},
        )) as {result?: unknown; finished?: boolean};
    };
    const ask = async (question: string, options?: string[]): Promise<string> => {
        const ran = await call({
            toolName: 'askHuman',
            args: {...(question && {question}), ...(options && {options})},
        });
        const result = ran?.result as {answerText?: string; suspended?: boolean} | undefined;
        if (result?.suspended) park(parked.promptId, question);
        return result?.answerText ?? 'The person has not answered yet.';
    };

    const definitions = request.tools.filter(tool =>
        (COPILOT_TOOL_NAMES as readonly string[]).includes(tool.toolName),
    );
    const config: Record<string, unknown> = {
        ...copilotSessionConfig(account, request),
        tools: {
            definitions: definitions.map(definition => copilotToolOf(sdk, definition, call, park)),
            // The switch itself: a session offered no shell tool cannot run a command, whatever the
            // model decides to try (`@@D-974`).
            ...(request.allowShell === false && {excludedTools: [...COPILOT_SHELL_TOOLS]}),
        },
        // The deployment's command switch means here what it means for a step engine (`@@D-974`).
        permissions: {onRequest: copilotPermissionFor(request.allowShell)},
        // The runtime has its own question tool; it parks the same session through the same bridge.
        interaction: {
            onUserInputRequest: async (input: {question?: string; choices?: string[]}) => ({
                answer: await ask(
                    String(input?.question ?? ''),
                    Array.isArray(input?.choices) ? input.choices.map(String) : undefined,
                ),
                wasFreeform: true,
            }),
        },
    };

    run.session = request.sessionKey
        ? await client.resumeSession(request.sessionKey, config as ResumeSessionOptions)
        : await client.createSession({
              ...(config as CreateSessionOptions),
              // Create-only: the runtime host's git operations need to trust the directory the
              // ticket works in, and the ticket is the only thing that uses it.
              ...(request.workspacePath && {
                  filesystem: {trustWorkingDirectory: 'session'},
              }),
          });
    const current = run.session;
    const key = sessionKeyOf(account, request.workspacePath);
    sessions.set(key, current);

    const events: Array<{kind: string; payload?: unknown}> = [];
    const offMessage = current.on('assistant.message', event => {
        events.push({kind: 'text', payload: {text: event.data.content}});
    });
    const offTool = current.on('tool.execution_start', event => {
        events.push({kind: 'tool', payload: event.data});
    });
    const offToolDone = current.on('tool.execution_complete', event => {
        events.push({kind: 'tool-result', payload: event.data});
    });

    let final: {data?: {content?: string}} | undefined;
    try {
        final = await current.sendAndWait(
            {prompt: request.prompt},
            account.timeoutMs && account.timeoutMs > 0 ? account.timeoutMs : undefined,
        );
    } catch (error) {
        // The abort this module raised to park the session is the outcome, not a failure (`@@D-976`).
        if (!run.aborted) throw error;
    } finally {
        offMessage?.();
        offTool?.();
        offToolDone?.();
    }

    const text =
        final?.data?.content ??
        (
            [...events].reverse().find(event => event.kind === 'text')?.payload as
                | {text?: string}
                | undefined
        )?.text;

    return {
        text,
        sessionKey: current.sessionId,
        finishReason: parked.promptId ? 'suspended' : 'idle',
        events,
        ...(parked.promptId && {suspended: parked}),
    };
};

/** A host this process can reach without the runtime's non-loopback rule. */
const LOOPBACK = /^(127\.0\.0\.1|localhost|::1|\[::1\])$/;

/** The client for an account's endpoint, started once and reused. */
export const clientOf = async (account: IAgentEngineAccount): Promise<CopilotClient> => {
    if (!account.runtimeUrl)
        throw new Error(
            `the copilot account needs runtimeUrl (host:port), not ${account.runtimeUrl}`,
        );
    const key = clientKeyOf(account);
    const existing = clients.get(key);
    if (existing) return existing;
    const sdk = await sdkOf();
    const {host, port} = copilotEndpoint(account.runtimeUrl);
    const token = tokenOf(account);
    // A runtime on a non-loopback address refuses a client with no token, and the handshake answers
    // AUTHENTICATION_FAILED — which reads as a wrong token. The likelier cause is no token at all,
    // and the likelier reason is a token value written into `runtimeTokenEnv`, which is a variable
    // name: say which it was, and never echo the value that was put there.
    if (!token && !LOOPBACK.test(host)) {
        const named = account.runtimeTokenEnv;
        throw new Error(
            `the copilot account for ${account.runtimeUrl} sends no runtime token: set ` +
                `runtimeToken, or runtimeTokenEnv naming a variable that holds one` +
                (named && /^[A-Za-z_]\w*$/.test(named)
                    ? ` (${named} is not set)`
                    : ' (runtimeTokenEnv is not a variable name)'),
        );
    }
    const client = new sdk.CopilotClient({
        // `coding-agent` is the CLI's own default set of tools and behaviour; `empty` is for a shared
        // multi-tenant service, which one ticket per runtime is not.
        mode: 'coding-agent',
        runtime: sdk.RuntimeConnection.forTcp(host, port, token ? {connectionToken: token} : {}),
    });
    await client.start();
    clients.set(key, client);
    return client;
};

/**
 * Whether this process can answer for the account, proven by a ping.
 *
 * A runtime that is down is an account that cannot be claimed on, and the claim asks this before it
 * takes a ticket (`@@D-970`): a ping is the cheapest question that distinguishes "no server" from
 * "no account".
 */
export const copilotCheck = async (
    account: IAgentEngineAccount,
): Promise<{
    reachable: boolean;
    kind: string;
    mode: string;
    tools: string[];
    workspaceRoot?: string;
}> => {
    const bound = Math.min(Math.max(account.timeoutMs ?? 5_000, 1_000), 10_000);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        // The connect is inside the race on purpose: an unreachable host answers nothing at all, and
        // a claim that waited for the operating system's connect timeout would hold the ticket.
        await Promise.race([
            (async () => {
                const client = await clientOf(account);
                await client.ping('blong');
            })(),
            new Promise((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error('the copilot runtime did not answer a ping')),
                    bound,
                );
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
    return {
        reachable: true,
        kind: 'copilot',
        mode: 'native',
        tools: [...COPILOT_TOOL_NAMES],
        ...(account.workspaceRoot && {workspaceRoot: account.workspaceRoot}),
    };
};

/**
 * Disconnect the session this workspace was holding, never delete it.
 *
 * The runtime keeps the transcript on disk, which is what a resume of a suspended ticket names
 * (`@@D-977`). Deleting a finished session is retention policy, and not this verb's.
 */
export const copilotClose = (account: IAgentEngineAccount, workspacePath?: string): void => {
    const key = sessionKeyOf(account, workspacePath);
    const session = sessions.get(key);
    if (!session) return;
    sessions.delete(key);
    void session.disconnect().catch(() => undefined);
};

/** Forget the clients, for a test that starts a fresh runtime on the same endpoint. */
export const copilotReset = (): void => {
    sessions.clear();
    clients.clear();
};

/**
 * Stop every client this process started.
 *
 * A started client holds a TCP connection, and a connection holds the event loop: a process that ran
 * one copilot session and never stops its clients does not exit, which is a run that never reports.
 * The platform's `stop` is where this belongs, not a session's close — the client is shared by every
 * session that named its endpoint (`@@D-971`).
 */
export const copilotStopClients = async (): Promise<void> => {
    const started = [...clients.values()];
    clients.clear();
    sessions.clear();
    for (const client of started) await client.stop().catch(() => undefined);
};
