/**
 * The batched hand-off from an engine kind to the realm that publishes it (`@@D-994`).
 *
 * A kind calls `report` as it works; this module decides when a batch leaves. The buffering is here
 * rather than in each kind because every kind would otherwise invent its own window, and because the
 * window is a property of the feed — one dispatch per 75 ms of deltas, not one per token.
 *
 * Two rules the shape encodes: a batch that cannot be dispatched is dropped (telemetry is
 * observability, and a run must not fail because its trace could not be published), and the batches
 * of one run are dispatched in order, because a reader renders them in the order they arrive.
 */
import type {
    AgentTelemetryKind,
    AgentTelemetryReport,
    IAgentEventDispatch,
    IAgentTelemetryEvent,
} from '@feasibleone/blong/types';

/** How a batch reaches the realm: the adapter's dispatch, with a method and a meta. */
export type TelemetryDispatch = (
    params: Record<string, unknown>,
    meta: Record<string, unknown>,
) => Promise<unknown>;

export interface ITelemetryBatchOptions {
    /** How long the first event of a batch waits for company. */
    maxWaitMs?: number;
    /** How many events fill a batch whatever the time. */
    maxEvents?: number;
}

/** What a run may do with what it observes. */
export interface IAgentTelemetry {
    report: AgentTelemetryReport;
    /** Send what is buffered, and wait for every batch this reporter started. */
    flush: () => Promise<void>;
}

/** The defaults: one dispatch per 75 ms of a token stream, or per 64 events. */
export const TELEMETRY_BATCH = {maxWaitMs: 75, maxEvents: 64} as const;

const silent: IAgentTelemetry = {report: () => undefined, flush: async () => undefined};

/**
 * A reporter for one call, or a silent one when the realm asked for no feed.
 *
 * Silent rather than throwing: a kind reports unconditionally, and a deployment that publishes no
 * telemetry must not have to know that its kinds are reporting into nothing.
 */
export const agentTelemetry = (
    dispatch: TelemetryDispatch,
    eventDispatch: IAgentEventDispatch | undefined,
    options: ITelemetryBatchOptions = {},
): IAgentTelemetry => {
    if (!eventDispatch) return silent;
    const maxWaitMs = options.maxWaitMs ?? TELEMETRY_BATCH.maxWaitMs;
    const maxEvents = options.maxEvents ?? TELEMETRY_BATCH.maxEvents;
    let pending: IAgentTelemetryEvent[] = [];
    let seq = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sending: Promise<unknown> = Promise.resolve();

    const send = (): Promise<unknown> => {
        if (timer) {
            clearTimeout(timer);
            timer = undefined;
        }
        if (pending.length === 0) return sending;
        const events = pending;
        pending = [];
        sending = sending
            .then(() =>
                dispatch(
                    {sessionId: eventDispatch.sessionId, events},
                    {
                        ...(eventDispatch.meta ?? {}),
                        method: eventDispatch.method,
                        mtid: 'request',
                    },
                ),
            )
            // A batch nobody could publish is dropped. It travels with the run's trace, and a run
            // that fails because its observability failed is the wrong trade.
            // A batch nobody could publish is dropped. It travels with the run's trace, and a run
            // that fails because its observability failed is the wrong trade.
            .catch(() => undefined);
        return sending;
    };

    const report = (kind: AgentTelemetryKind, payload?: unknown): void => {
        pending.push({
            sessionId: eventDispatch.sessionId,
            seq: seq++,
            kind,
            payload,
            at: Date.now(),
        });
        if (pending.length >= maxEvents) {
            void send();
            return;
        }
        timer ??= setTimeout(() => {
            timer = undefined;
            void send();
        }, maxWaitMs);
    };

    return {
        report,
        flush: async () => {
            await send();
        },
    };
};
