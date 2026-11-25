import {orchestrator} from '@feasibleone/blong';
import type {VocabularyProxy} from '@feasibleone/blong/types';

import {agentSettings, type IAgentDispatchSettings} from './settings.ts';

/**
 * What a wake's message names, when it parses.
 *
 * The channel carries the session and the prompt an answer belongs to; anything else — a message
 * that is not JSON, or one from a publisher this realm does not know — names nothing and a wake that
 * names nothing is one the answer handler declines (`@@D-709`).
 */
const wakeParamsOf = (message: string): {sessionId?: string; promptId?: string} => {
    try {
        const payload = JSON.parse(message) as {sessionId?: unknown; promptId?: unknown} | null;
        if (!payload || typeof payload !== 'object') return {};
        return {
            ...(payload.sessionId === undefined ? {} : {sessionId: String(payload.sessionId)}),
            ...(payload.promptId === undefined ? {} : {promptId: String(payload.promptId)}),
        };
    } catch {
        return {};
    }
};

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
 * The wake-up channel is opened here for the same reason: a subscription is a read of a broker and
 * what a message means is a decision, so the subscription is the orchestrator's and the adapter it is
 * opened through only carries it (`@@T-816`). A message is dispatched to `agent.answer.wake` by the
 * loop below, which is where the decision to resume already is.
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
        notify: {
            // The wake-up channel (`@@D-709`). Only this intent turns it on, because only this intent
            // loads the broker the subscription is opened through: a deployment with no broker runs
            // without one and loses a wait rather than the resume, which the tick still makes.
            wake: {channel: 'agent.answer.wake'},
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
        const self = this as unknown as {
            workerTimer?: ReturnType<typeof setInterval>;
            wakeWatch?: AbortController;
        };
        if (self.workerTimer) clearInterval(self.workerTimer);
        self.workerTimer = undefined;
        // The subscription ends with the process: an abort is the reader saying it stopped reading, and
        // the adapter's own loop closes the subscriber when it arrives.
        self.wakeWatch?.abort();
        self.wakeWatch = undefined;
        return super.stop?.();
    },
    /**
     * Open the wake subscription, once every port has started.
     *
     * Here rather than in `start()` because the subscription is opened *through* an adapter, and a
     * port registers itself while it starts: a call made from `start()` may find nothing to answer
     * it, depending on which layer the loader reached first. `ready()` is the phase that runs after
     * all of them.
     *
     * A subscription that cannot be opened is a warning, never a failure: the answer row is the truth
     * and the worker tick is what makes progress, so a wake is the shortening of a wait (`@@D-709`).
     * Each message is dispatched to the realm and not read here — what a wake names is the answer
     * handler's business, and it declines a session this host does not hold.
     */
    async ready() {
        const ready = await super.ready();
        const self = this as unknown as {
            config?: IAgentDispatchSettings;
            wakeWatch?: AbortController;
            signal?: VocabularyProxy;
        };
        const wake = agentSettings(self.config).wake;
        if (!wake.channel) return ready;
        const controller = new AbortController();
        self.wakeWatch = controller;
        const method = `${wake.adapter}.sub.watch`;
        void (async () => {
            try {
                const source = (await remote.remote(method)(
                    {channel: wake.channel},
                    {
                        method,
                        mtid: 'request',
                        stream: true,
                        abort: controller.signal,
                    } as never,
                )) as AsyncIterable<{channel: string; message: string}>;
                for await (const entry of source) {
                    // A wake is a nudge: a dispatch that fails is recorded by the port that failed it,
                    // and the next tick picks the work up anyway.
                    void Promise.resolve(
                        remote.dispatch(wakeParamsOf(entry.message), {
                            method: wake.method,
                            mtid: 'request',
                        } as never),
                    ).catch(() => undefined);
                }
            } catch (error) {
                self.signal?.agentAnswerWakeUnsubscribed?.({
                    channel: wake.channel,
                    error: String((error as Error)?.message ?? error),
                });
            }
        })();
        return ready;
    },
}));
