/**
 * The header's numbers, from whatever a page holds (`@@T-800`).
 *
 * Two sources answer the same cells and they are not equal: the projection in MySQL is what a settled
 * session has, and the events in hand are what a running one has. A header that showed only the
 * projection would freeze at the last folded batch; one that showed only the events would report zero
 * for a session whose tail the page never read. So the page starts from the projection and this module
 * recomputes the cells from the events it has — and says which of the two a number came from, so a
 * live figure is not mistaken for a settled one.
 *
 * The estimator is the projector's own rule of four characters per token (`agentMetricProject`), kept
 * in step by the test beside this file rather than by a second definition.
 */

import type {ISessionEvent} from './sessionSections.ts';

/** The per-tool arithmetic a projection keeps, and an event list can recompute. */
export interface ISessionToolUse {
    name: string;
    count: number;
    durationMs: number;
}

export interface ISessionHeader {
    turns: number;
    /** Tokens the engine reported as input, when it reported any. */
    tokensIn: number;
    /** Tokens a reader was shown, estimated from the message deltas. */
    tokensOut: number;
    /** What the context holds: in plus out, which is what a window is measured against. */
    contextLength: number;
    tools: ISessionToolUse[];
    /** The total time spent inside tools, which is where a session's wall clock goes. */
    toolTotalMs: number;
    /** A tool that has been called and has not answered, with how long it has been running. */
    runningTool?: {name: string; elapsedMs: number};
    /** `live` when a cell came from the events in hand, `settled` when only the projection answered. */
    source: 'live' | 'settled';
}

const CHARS_PER_TOKEN = 4;

const textOf = (payload: unknown): string => {
    if (typeof payload === 'string') return payload;
    const text = (payload as {text?: unknown} | undefined)?.text;
    return typeof text === 'string' ? text : '';
};

const numberAt = (value: unknown): number | undefined => {
    const size = Number(value);
    return Number.isFinite(size) && size >= 0 ? size : undefined;
};

/**
 * The header a page draws.
 *
 * `now` is passed rather than read so the running tool's elapsed time is a function of the input: a
 * component re-renders on a timer and the test states what "now" is.
 */
export const sessionHeaderOf = (
    events: readonly ISessionEvent[],
    options: {now?: number} = {},
): ISessionHeader => {
    let turns = 0;
    let tokensIn = 0;
    let tokensOut = 0;
    let usageSeen = false;
    const tools = new Map<string, ISessionToolUse>();
    let running: {name: string; startedAt: number} | undefined;

    for (const event of events) {
        if (event.kind === 'status') {
            const payload = event.payload as {state?: unknown; usage?: unknown} | undefined;
            if (payload?.state === 'running') turns += 1;
            const usage = payload?.usage as
                | {inputTokens?: unknown; input_tokens?: unknown}
                | undefined;
            const input = numberAt(usage?.inputTokens ?? usage?.input_tokens);
            if (input !== undefined) {
                tokensIn = Math.max(tokensIn, input);
                usageSeen = true;
            }
            continue;
        }
        if (event.kind === 'message' || event.kind === 'text') {
            tokensOut += Math.ceil(textOf(event.payload).length / CHARS_PER_TOKEN);
            continue;
        }
        if (event.kind === 'tool') {
            const name = (event.payload as {toolName?: unknown} | undefined)?.toolName;
            if (typeof name === 'string' && name !== '') {
                running = {name, startedAt: event.at ?? 0};
            }
            continue;
        }
        if (event.kind === 'tool-result') {
            const payload = event.payload as
                | {toolName?: unknown; durationMs?: unknown; toolCallId?: unknown}
                | undefined;
            const name = typeof payload?.toolName === 'string' ? payload.toolName : running?.name;
            if (!name) continue;
            const duration = numberAt(payload?.durationMs) ?? 0;
            const known = tools.get(name) ?? {name, count: 0, durationMs: 0};
            tools.set(name, {
                name,
                count: known.count + 1,
                durationMs: known.durationMs + duration,
            });
            // A result closes the tool it names; a stream with several in flight is not a case the
            // engines produce, and the newest call is the one a result answers.
            running = undefined;
        }
    }

    const toolTotalMs = [...tools.values()].reduce((sum, tool) => sum + tool.durationMs, 0);
    const now = options.now ?? Date.now();
    return {
        turns,
        tokensIn,
        tokensOut,
        contextLength: tokensIn + tokensOut,
        tools: [...tools.values()].sort((first, second) => second.count - first.count),
        toolTotalMs,
        ...(running && {
            runningTool: {name: running.name, elapsedMs: Math.max(0, now - running.startedAt)},
        }),
        source: usageSeen ? 'live' : 'settled',
    };
};

/**
 * Fill the cells a stream cannot answer from the projection the row carries.
 *
 * A list row already has turns, tokens and per-tool counts folded from every batch — including the
 * ones before the page opened. What it cannot have is a running tool's elapsed time or a turn still
 * in flight, so the projection answers those, and the events override a cell only where they know
 * more than it does.
 */
export const sessionHeaderMerge = (
    projected:
        | {turnCount?: number; messageTokens?: number; toolCount?: number; tools?: unknown}
        | undefined,
    live: ISessionHeader,
): ISessionHeader => {
    if (!projected) return live;
    const turns = Math.max(Number(projected.turnCount ?? 0), live.turns);
    const tokensOut = Math.max(Number(projected.messageTokens ?? 0), live.tokensOut);
    const tools = live.tools.length > 0 ? live.tools : sessionToolsOf(projected.tools);
    return {
        ...live,
        turns,
        tokensOut,
        contextLength: live.tokensIn + tokensOut,
        tools,
        toolTotalMs:
            live.tools.length > 0
                ? live.toolTotalMs
                : tools.reduce((sum, tool) => sum + tool.durationMs, 0),
    };
};

/** The projection's `tools` column as the header's list, whatever shape it was read back in. */
export const sessionToolsOf = (projected: unknown): ISessionToolUse[] => {
    const source =
        typeof projected === 'string'
            ? (() => {
                  try {
                      return JSON.parse(projected) as unknown;
                  } catch {
                      return undefined;
                  }
              })()
            : projected;
    if (!source || typeof source !== 'object') return [];
    return Object.entries(source as Record<string, {count?: unknown; durationMs?: unknown}>)
        .map(([name, use]) => ({
            name,
            count: Number(use?.count ?? 0),
            durationMs: Number(use?.durationMs ?? 0),
        }))
        .sort((first, second) => second.count - first.count);
};
