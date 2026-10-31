import type {
    IAgentEngineAccount,
    IAgentSessionRequest,
    IAgentSessionResult,
    IAgentStepRequest,
    IAgentStepResult,
} from '@feasibleone/blong/types';
import {adapter, type Adapter} from '@feasibleone/blong/types';

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

/** The kind's default mode, when the account does not name one. */
const modeOf = (account: IAgentEngineAccount): 'step' | 'native' =>
    account.mode ?? (account.kind === 'deepseek' ? 'native' : 'step');

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

const stepOf = async (
    self: Adapter<IConfig>,
    request: IAgentStepRequest,
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
        case 'deepseek': {
            // The harness owns its loop, so a one-turn request becomes a session with one prompt.
            const lastUser = [...request.history]
                .reverse()
                .find(message => message.role === 'user') as {text?: string} | undefined;
            const native = await sessionOf(self, {
                account: request.account,
                prompt: lastUser?.text ?? '',
                tools: request.tools,
            });
            return {
                text: native.text,
                toolCalls: [],
                finishReason: native.finishReason ?? 'native',
            };
        }
        default:
            return unavailable(account);
    }
};

const sessionOf = async (
    self: Adapter<IConfig>,
    request: IAgentSessionRequest,
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
        case 'vercel':
        case 'mastra':
            // A step engine has no loop of its own: one prompt is one turn.
            return {
                text: (
                    await stepOf(self, {
                        account: request.account,
                        instructions: '',
                        history: [{role: 'user', text: request.prompt}],
                        tools: request.tools,
                    })
                ).text,
                finishReason: 'step',
            };
        default:
            return unavailable(account);
    }
};

export default adapter<IConfig>(() => ({
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
    /** One model turn, executed by the account's kind. The realm's loop calls this (`@@D-708`). */
    async engineStep(this: Adapter<IConfig>, request: IAgentStepRequest) {
        return stepOf(this, request);
    },
    /** A native run, for an engine that owns its loop (`@@D-711`). */
    async engineSession(this: Adapter<IConfig>, request: IAgentSessionRequest) {
        return sessionOf(this, request);
    },
    /** Release whatever the account is holding: a scripted cursor, or a harness subprocess. */
    async engineClose(this: Adapter<IConfig>, params: {account: string; workspacePath?: string}) {
        const account = accountOf(this, params.account);
        if (!account) return {closed: false};
        if (account.kind === 'sim') simReset(params.account, params.workspacePath);
        if (account.kind === 'deepseek') {
            const {deepseekClose} = (await loadKind('Deepseek').catch(() =>
                unavailable(account),
            )) as {deepseekClose: (a: IAgentEngineAccount, w?: string) => void};
            deepseekClose(account, params.workspacePath);
        }
        return {closed: true};
    },
    /** Whether this process can answer for the account at all, and in which mode. */
    async engineCheck(this: Adapter<IConfig>, params: {account: string}) {
        const account = accountOf(this, params.account);
        if (!account) return {reachable: false, kind: 'none', mode: 'none'};
        if (account.kind === 'vercel' || account.kind === 'mastra')
            await (account.kind === 'vercel' ? loadKind('Vercel') : loadKind('Mastra')).catch(() =>
                unavailable(account),
            );
        if (account.kind === 'deepseek')
            await loadKind('Deepseek').catch(() => unavailable(account));
        return {reachable: true, kind: account.kind, mode: modeOf(account)};
    },
}));
