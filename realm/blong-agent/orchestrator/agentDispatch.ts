import {orchestrator} from '@feasibleone/blong';

import type {IAgentDispatchSettings} from './settings.ts';

/**
 * `orchestrator/agentDispatch.ts` — the realm's one namespace.
 *
 * The vocabulary is a process lifecycle rather than entity CRUD — claim, run, suspend, resume,
 * recover — so the realm declares its own dispatch orchestrator instead of contributing to
 * blong-server's subject one (`@@D-704`). Everything a custom handler does not answer is forwarded to
 * the shared `db` adapter, which is where the persistence handlers come from.
 *
 * The worker is a group on this orchestrator rather than an orchestrator of its own: the loop and the
 * methods it calls have to answer on one namespace, and a broker is a wake-up rather than the
 * transport that carries work (`@@D-704`).
 *
 * The settings below are read by the handlers through `this.config` — the orchestrator's own slice,
 * `agent.agentDispatch` — which is the rule `@@F-641` records.
 */
export default orchestrator<IAgentDispatchSettings & {workerStart?: boolean}>(({remote}) => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: 'agent',
            imports: [/\.(ticket|session|answer|recovery|worker|persona|chat)$/],
            destination: 'db',
            /** The method a human question is asked through, so a test can answer without chat. */
            questionMethod: 'chat.prompt.ask',
            /** The engine instance a claim opens a session with, and the account inside it. */
            engineAdapter: 'engine',
            engineAccount: '',
            /** One pass of the worker. */
            tickMs: 5_000,
            /** How long a claim holds before another worker may take the ticket. */
            leaseMs: 60_000,
            /** Renewed well inside the lease, including while a question is parked. */
            heartbeatMs: 20_000,
            /** Thirty minutes, the window the brief asks for. */
            questionTimeoutMs: 1_800_000,
            maxSteps: 40,
            maxToolCalls: 12,
            /** The window a chat session stays open, when the persona names none (@@D-729). */
            continuationMinutes: 1440,
            /** The method a chat turn's reply is sent through. */
            replyMethod: 'chat.out.message.send',
            /** Whether the port starts the worker itself; a test drives the tick by hand instead. */
            workerStart: true,
        },
        integration: {
            // A test run claims nothing behind a developer's back: the tick is called explicitly.
            workerStart: false,
            engineAccount: 'local',
        },
    },
    /**
     * The port owns the worker's clock, and it is the port rather than a timer in the realm because a
     * reload replaces handlers and must not replace the loop with a second one.
     *
     * The interval is `unref`'d: a worker that is the only thing left running must not keep a process
     * alive past the work, and an in-flight guard means a slow pass delays the next one instead of
     * stacking a second beside it (`@@D-704`). `workerStart: false` is how a test drives the tick by
     * hand, and how a deployment that runs the tick from elsewhere says so.
     */
    start() {
        super.connect();
        const started = super.start();
        const self = this as unknown as {
            config?: {workerStart?: boolean; tickMs?: number};
            workerTimer?: ReturnType<typeof setInterval>;
        };
        if (self.config?.workerStart === false) return started;
        if (self.workerTimer) clearInterval(self.workerTimer);
        let inFlight = false;
        const timer = setInterval(() => {
            if (inFlight) return;
            inFlight = true;
            void Promise.resolve(
                remote.dispatch({}, {
                    method: 'agent.worker.tick',
                    mtid: 'request',
                } as never),
            ).finally(() => {
                inFlight = false;
            });
        }, self.config?.tickMs ?? 5_000);
        (timer as unknown as {unref?: () => void}).unref?.();
        self.workerTimer = timer;
        return started;
    },
    stop() {
        const self = this as unknown as {workerTimer?: ReturnType<typeof setInterval>};
        if (self.workerTimer) clearInterval(self.workerTimer);
        self.workerTimer = undefined;
        return super.stop?.();
    },
}));
