import type {
    IAgentEngineAccount,
    IAgentSessionRequest,
    IAgentSessionResult,
    IAgentStepRequest,
    IAgentStepResult,
} from '@feasibleone/blong/types';
import {adapter, type Adapter} from '@feasibleone/blong/types';

import type {CopilotDispatch} from '../../agent/agentCopilot.ts';
import {simReset, simSession, simStep} from '../../agent/agentSim.ts';

/**
 * `adapter.engine` — the engine adapter: one turn in, tool calls out, and a native run for the engines
 * that own their loop (`@@D-708`).
 *
 * Four implementations sit behind it, chosen per account alias by `kind`:
 *
 * - `sim` replays a script and needs no network, which is what the realm's tests use;
 * - `vercel` and `mastra` answer one model turn and execute nothing, so the realm keeps the loop;
 * - `deepseek` drives the published harness client, which spawns its own runtime and runs the tools
 *   itself (`@@D-711`).
 *
 * The three vendor modules are imported dynamically inside the call, not at load: a deployment that
 * configures one engine does not carry the other two, and a package that is missing or an alpha
 * fails one account rather than the process (`@@D-700`).
 *
 * The namespace is the instance's, not the realm's, and one process may hold several instances of
 * this adapter under different names (`@@D-712`) — the registry keeps their accounts apart.
 */
export interface IConfig {
    accounts?: Record<string, IAgentEngineAccount>;
}

const accountOf = (self: Adapter<IConfig>, alias: string): IAgentEngineAccount | undefined =>
    (self.config as IConfig | undefined)?.accounts?.[alias];

/**
 * Whether a copilot session was opened in this process.
 *
 * Set when the kind is dispatched, not when an account is configured: a deployment whose copilot
 * accounts were never used has no client to stop and must not load the module to find that out.
 */
let copilotStarted = false;

/** The kind's default mode, when the account does not name one. */
const modeOf = (account: IAgentEngineAccount): 'step' | 'native' =>
    account.mode ?? (account.kind === 'deepseek' || account.kind === 'copilot' ? 'native' : 'step');

const unavailable = (account: IAgentEngineAccount): never => {
    throw new Error(`engine kind ${account.kind} is not available in this process`);
};

/**
 * Load a kind's implementation at call time.
 *
 * The specifier is computed so the compiler does not require the module to exist: an engine package
 * that a deployment did not install, or an alpha that changed shape, fails the one account that
 * named it rather than the whole process (`@@D-700`).
 *
 * The implementations live in `src/agent/`, not beside this file, because `adapter/server/` is a
 * folder the loader **scans and imports whole** in every process: a module there is evaluated even
 * when no account names it, which for an engine means loading an SDK nobody asked for. Here the
 * import is the call, so a process with no `deepseek` account never touches the harness client
 * (`@@T-593`: each kind's own header says where it loads from).
 */
const loadKind = async (name: string): Promise<Record<string, unknown>> =>
    (await import(`../../agent/agent${name}.ts`)) as Record<string, unknown>;

/**
 * A native engine asked for one turn: a session whose prompt is that turn.
 *
 * Shared by every kind that owns its loop, so the two of them cannot answer a step request two
 * different ways.
 */
const nativeAsStep = async (
    self: Adapter<IConfig>,
    request: IAgentStepRequest,
    dispatch: CopilotDispatch,
): Promise<IAgentStepResult> => {
    const lastUser = [...request.history].reverse().find(message => message.role === 'user') as
        | {text?: string}
        | undefined;
    const native = await sessionOf(
        self,
        {
            account: request.account,
            prompt: lastUser?.text ?? '',
            tools: request.tools,
            instructions: request.instructions,
            allowShell: request.allowShell,
            toolDispatch: request.toolDispatch,
        },
        dispatch,
    );
    return {text: native.text, toolCalls: [], finishReason: native.finishReason ?? 'native'};
};

const stepOf = async (
    self: Adapter<IConfig>,
    request: IAgentStepRequest,
    dispatch: CopilotDispatch,
): Promise<IAgentStepResult> => {
    const account = accountOf(self, request.account);
    if (!account) throw new Error(`engine account ${request.account} is not configured`);
    switch (account.kind) {
        case 'sim':
            return simStep(account.script ?? [], request.account, request);
        case 'vercel': {
            const {vercelStep} = (await loadKind('Vercel').catch(() => unavailable(account))) as {
                vercelStep: (
                    a: IAgentEngineAccount,
                    r: IAgentStepRequest,
                ) => Promise<IAgentStepResult>;
            };
            return vercelStep(account, request);
        }
        case 'mastra': {
            const {mastraStep} = (await loadKind('Mastra').catch(() => unavailable(account))) as {
                mastraStep: (
                    a: IAgentEngineAccount,
                    r: IAgentStepRequest,
                ) => Promise<IAgentStepResult>;
            };
            return mastraStep(account, request);
        }
        case 'deepseek':
        case 'copilot':
            // The harness owns its loop, so a one-turn request becomes a session with one prompt.
            return nativeAsStep(self, request, dispatch);
        default:
            return unavailable(account);
    }
};

const sessionOf = async (
    self: Adapter<IConfig>,
    request: IAgentSessionRequest,
    dispatch: CopilotDispatch,
): Promise<IAgentSessionResult> => {
    const account = accountOf(self, request.account);
    if (!account) throw new Error(`engine account ${request.account} is not configured`);
    switch (account.kind) {
        case 'sim':
            return simSession(account.script ?? [], request.account, request);
        case 'deepseek': {
            const {deepseekSession} = (await loadKind('Deepseek').catch(() =>
                unavailable(account),
            )) as {
                deepseekSession: (
                    a: IAgentEngineAccount,
                    r: IAgentSessionRequest,
                ) => Promise<IAgentSessionResult>;
            };
            return deepseekSession(account, request);
        }
        case 'copilot': {
            copilotStarted = true;
            const {copilotSession} = (await loadKind('Copilot').catch(() =>
                unavailable(account),
            )) as {
                copilotSession: (
                    a: IAgentEngineAccount,
                    r: IAgentSessionRequest,
                    d: CopilotDispatch,
                ) => Promise<IAgentSessionResult>;
            };
            return copilotSession(account, request, dispatch);
        }
        case 'vercel':
        case 'mastra':
            // A step engine has no loop of its own: one prompt is one turn.
            return {
                text: (
                    await stepOf(
                        self,
                        {
                            account: request.account,
                            instructions: '',
                            history: [{role: 'user', text: request.prompt}],
                            tools: request.tools,
                        },
                        dispatch,
                    )
                ).text,
                finishReason: 'step',
            };
        default:
            return unavailable(account);
    }
};

export default adapter<IConfig>(api => {
    /**
     * The realm's tool boundary, reached by name (`@@D-975`).
     *
     * A native engine's custom tool handler runs in this process, so the call is local even when the
     * model runs on another host; the `$meta` method is what names the handler.
     */
    const dispatch: CopilotDispatch = (params, meta) =>
        Promise.resolve(api.dispatch(params, meta)) as Promise<unknown>;

    return {
        activation: {
            default: {
                namespace: 'engine',
                imports: [/\.engine$/],
                accounts: {},
            },
        },
        /**
         * Open the adapter's loop before the platform starts serving.
         *
         * A base adapter that never calls `super.connect()` leaves the port's queue without a loop, and the
         * platform's `start` then waits for a promise that never settles — the log still shows
         * `adapter.start` and `adapter.ready`, which is what made this cost an afternoon (`@@F-651`).
         */
        start(this: Adapter<IConfig>) {
            super.connect();
            return super.start();
        },
        /**
         * Stop the runtime clients this process started.
         *
         * A started client holds a TCP connection and the connection holds the event loop, so a run that
         * opened a copilot session does not exit without this: the suite finished its work and then hung
         * until it was killed. The client is shared by every session that named its endpoint, which is why
         * the close belongs to the platform rather than to a session's own close (`@@D-971`).
         */
        async stop(this: Adapter<IConfig>) {
            if (copilotStarted) {
                const {copilotStopClients} = (await loadKind('Copilot').catch(() => ({}))) as {
                    copilotStopClients?: () => Promise<void>;
                };
                await copilotStopClients?.();
            }
            return super.stop();
        },
        /** One model turn, executed by the account's kind. The realm's loop calls this (`@@D-708`). */
        async engineStep(this: Adapter<IConfig>, request: IAgentStepRequest) {
            return stepOf(this, request, dispatch);
        },
        /** A native run, for an engine that owns its loop (`@@D-711`). */
        async engineSession(this: Adapter<IConfig>, request: IAgentSessionRequest) {
            return sessionOf(this, request, dispatch);
        },
        /** Release whatever the account is holding: a scripted cursor, or a harness subprocess. */
        async engineClose(
            this: Adapter<IConfig>,
            params: {account: string; workspacePath?: string},
        ) {
            const account = accountOf(this, params.account);
            if (!account) return {closed: false};
            // A step dialogue starts over with the next run; a native one stops where it parked, because
            // the close that follows a suspension is what the resume continues from (`@@D-976`).
            if (account.kind === 'sim' && modeOf(account) === 'step')
                simReset(params.account, params.workspacePath);
            if (account.kind === 'deepseek') {
                const {deepseekClose} = (await loadKind('Deepseek').catch(() =>
                    unavailable(account),
                )) as {deepseekClose: (a: IAgentEngineAccount, w?: string) => void};
                deepseekClose(account, params.workspacePath);
            }
            if (account.kind === 'copilot') {
                const {copilotClose} = (await loadKind('Copilot').catch(() =>
                    unavailable(account),
                )) as {copilotClose: (a: IAgentEngineAccount, w?: string) => void};
                copilotClose(account, params.workspacePath);
            }
            return {closed: true};
        },
        /** Whether this process can answer for the account at all, and in which mode. */
        async engineCheck(this: Adapter<IConfig>, params: {account: string}) {
            const account = accountOf(this, params.account);
            if (!account) return {reachable: false, kind: 'none', mode: 'none'};
            if (account.kind === 'vercel' || account.kind === 'mastra')
                await (account.kind === 'vercel' ? loadKind('Vercel') : loadKind('Mastra')).catch(
                    () => unavailable(account),
                );
            if (account.kind === 'deepseek')
                await loadKind('Deepseek').catch(() => unavailable(account));
            if (account.kind === 'copilot') {
                const {copilotCheck} = (await loadKind('Copilot').catch(() =>
                    unavailable(account),
                )) as {
                    copilotCheck: (a: IAgentEngineAccount) => Promise<{
                        reachable: boolean;
                        kind: string;
                        mode: string;
                        tools: string[];
                        workspaceRoot?: string;
                    }>;
                };
                try {
                    return await copilotCheck(account);
                } catch (error) {
                    // A runtime that is down is an account nobody can claim on, not a crash
                    // (`@@D-970`). The reason travels with it: a refused token, a missing token and a
                    // dead host all read as `reachable: false` otherwise, and the first question a
                    // deployment asks is which one it was.
                    return {
                        reachable: false,
                        kind: 'copilot',
                        mode: 'native',
                        tools: [],
                        error: error instanceof Error ? error.message : String(error),
                        ...(account.workspaceRoot && {workspaceRoot: account.workspaceRoot}),
                    };
                }
            }
            return {
                reachable: true,
                kind: account.kind,
                mode: modeOf(account),
                // Where a kind's workspace lives is a property of the account, not of the kind
                // (`@@D-978`): a scripted account names one to exercise the remote path too.
                ...(account.workspaceRoot && {workspaceRoot: account.workspaceRoot}),
            };
        },
    };
});
