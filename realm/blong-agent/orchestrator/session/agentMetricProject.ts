import type {IAgentTelemetryEvent} from '@feasibleone/blong';
import {library} from '@feasibleone/blong';

/**
 * `agent.telemetry.project` — what a session's feed adds up to (`T-791`, `@@D-992`).
 *
 * Pure, so the arithmetic is asserted without a broker or a table: the projector folds the events it
 * is handed into the row a list and a header read. It is applied as the events are published, which
 * is why the summary is available while the topic is, and after it has been swept.
 *
 * A turn is counted from the `status` event that opens one, which the engine adapter reports for
 * every kind — so the count does not depend on which engine answered. Tokens are estimated from the
 * message deltas at four characters per token, because a delta stream carries no usage and a number
 * that is close is worth more to a list than a number that waits for an engine's final tally.
 */
export interface IAgentSessionMetric {
    turnCount: number;
    messageTokens: number;
    toolCount: number;
    /** Per tool name: how often it ran and how long it took in total. */
    tools: Record<string, {count: number; durationMs: number}>;
    lastEventAt: number;
}

export const EMPTY_METRIC: IAgentSessionMetric = {
    turnCount: 0,
    messageTokens: 0,
    toolCount: 0,
    tools: {},
    lastEventAt: 0,
};

/** Characters per token, the rule of thumb every estimator starts from. */
const CHARS_PER_TOKEN = 4;

const textOf = (payload: unknown): string => {
    if (typeof payload === 'string') return payload;
    const text = (payload as {text?: unknown} | undefined)?.text;
    return typeof text === 'string' ? text : '';
};

const toolOf = (payload: unknown): {toolName: string; durationMs: number} | undefined => {
    const candidate = payload as {toolName?: unknown; durationMs?: unknown} | undefined;
    if (typeof candidate?.toolName !== 'string') return undefined;
    const duration = Number(candidate.durationMs);
    return {
        toolName: candidate.toolName,
        durationMs: Number.isFinite(duration) && duration > 0 ? duration : 0,
    };
};

export const agentMetricProject = (
    previous: IAgentSessionMetric | undefined,
    events: IAgentTelemetryEvent[],
): IAgentSessionMetric => {
    const metric: IAgentSessionMetric = {
        ...(previous ?? EMPTY_METRIC),
        tools: {...(previous ?? EMPTY_METRIC).tools},
    };
    for (const event of events) {
        switch (event.kind) {
            case 'status':
                // The opening status of a call is what a turn is.
                if ((event.payload as {state?: string} | undefined)?.state === 'running')
                    metric.turnCount += 1;
                break;
            case 'message':
                metric.messageTokens += Math.ceil(textOf(event.payload).length / CHARS_PER_TOKEN);
                break;
            case 'tool-result': {
                const tool = toolOf(event.payload);
                if (!tool) break;
                metric.toolCount += 1;
                const known = metric.tools[tool.toolName] ?? {count: 0, durationMs: 0};
                metric.tools[tool.toolName] = {
                    count: known.count + 1,
                    durationMs: known.durationMs + tool.durationMs,
                };
                break;
            }
            default:
                break;
        }
        if (event.at > metric.lastEventAt) metric.lastEventAt = event.at;
    }
    return metric;
};

export default library(() => ({agentMetricProject}));
