/**
 * `agent.sim` — the scripted kind, and the one implementation the base imports itself.
 *
 * A model kind is reached only through `loadKind` in `adapter/server/engine.ts`, on the first turn
 * an account of that kind answers; this one is small enough that the base imports it directly,
 * because every test and every deployment without a key runs it (`@@T-593`).
 */
import type {
    IAgentScriptEntry,
    IAgentSessionRequest,
    IAgentSessionResult,
    IAgentStepRequest,
    IAgentStepResult,
} from '@feasibleone/blong/types';

/**
 * The scripted engine kind.
 *
 * It exists so the realm's tests and a deployment without a model key still run the whole loop: an
 * account whose `kind` is `sim` replays its `script` one entry per turn, and `session` replays the
 * whole of it as one native run (`@@D-708`). Nothing here talks to a network or reads a key, which is
 * what makes the fixture the default in `integration`.
 *
 * The cursor is per account and per workspace, because one process may run two simulated sessions at
 * once and each has to start at the top of its own script.
 */
const cursors = new Map<string, number>();

const cursorKey = (account: string, workspacePath?: string): string =>
    `${account}|${workspacePath ?? ''}`;

/** How far a simulated dialogue has got, for a test that wants to assert the replay. */
export const simCursor = (account: string, workspacePath?: string): number =>
    cursors.get(cursorKey(account, workspacePath)) ?? 0;

/** Forget a dialogue, which is what `engine.session.close` means for this kind. */
export const simReset = (account: string, workspacePath?: string): void => {
    cursors.delete(cursorKey(account, workspacePath));
};

/** One turn: the next script line, as either an answer or a call to run. */
export const simStep = (
    script: IAgentScriptEntry[],
    account: string,
    _request: IAgentStepRequest,
    workspacePath?: string,
): IAgentStepResult => {
    const key = cursorKey(account, workspacePath);
    const index = cursors.get(key) ?? 0;
    const entry = script[index];
    cursors.set(key, index + 1);
    if (!entry) return {text: 'Nothing left to do.', toolCalls: [], finishReason: 'stop'};
    if ('toolCall' in entry)
        return {
            ...(entry.text !== undefined && {text: entry.text}),
            toolCalls: [
                {
                    toolName: entry.toolCall.toolName,
                    ...(entry.toolCall.args !== undefined && {args: entry.toolCall.args}),
                    ...(entry.toolCall.toolCallId !== undefined && {
                        toolCallId: entry.toolCall.toolCallId,
                    }),
                },
            ],
            finishReason: 'tool-calls',
        };
    return {text: entry.text, toolCalls: [], finishReason: entry.finishReason ?? 'stop'};
};

/** A native run: the whole script, reported as the events the realm records. */
export const simSession = (
    script: IAgentScriptEntry[],
    account: string,
    request: IAgentSessionRequest,
): IAgentSessionResult => {
    const events: Array<{kind: string; payload?: unknown}> = [];
    let text: string | undefined;
    for (const entry of script) {
        if ('toolCall' in entry) {
            events.push({kind: 'tool', payload: entry.toolCall});
            continue;
        }
        text = entry.text;
        events.push({kind: 'text', payload: {text: entry.text}});
    }
    return {
        text,
        sessionKey: `sim-${cursorKey(account, request.workspacePath)}`,
        finishReason: 'stop',
        events,
    };
};
