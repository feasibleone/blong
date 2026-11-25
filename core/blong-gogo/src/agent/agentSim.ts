/**
 * `agent.sim` — the scripted kind, and the one implementation the base imports itself.
 *
 * A model kind is reached only through `loadKind` in `adapter/server/engine.ts`, on the first turn
 * an account of that kind answers; this one is small enough that the base imports it directly,
 * because every test and every deployment without a key runs it (`@@T-593`).
 */
import type {
    AgentTelemetryReport,
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
    // A suspension is a native outcome; a step engine that meets one stops without a call.
    if ('suspend' in entry) return {toolCalls: [], finishReason: 'suspended'};
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
    report: AgentTelemetryReport = () => undefined,
): IAgentSessionResult => {
    const events: Array<{kind: string; payload?: unknown}> = [];
    const key = cursorKey(account, request.workspacePath);
    // A resume names the session it is continuing, so it carries on after the entry that parked it;
    // a fresh run starts at the top, like the step kind does.
    let index = request.sessionKey ? (cursors.get(key) ?? 0) : 0;
    let text: string | undefined;
    let suspended: {promptId?: string; question?: string} | undefined;
    for (; index < script.length; index += 1) {
        const entry = script[index];
        if ('suspend' in entry) {
            // The run parked on a question: the rest of the script is what the resume would say.
            suspended = entry.suspend;
            events.push({kind: 'suspend', payload: entry.suspend});
            report('status', {state: 'awaiting-human', question: entry.suspend.question});
            cursors.set(key, index + 1);
            break;
        }
        if ('toolCall' in entry) {
            events.push({kind: 'tool', payload: entry.toolCall});
            report('tool', entry.toolCall);
            continue;
        }
        text = entry.text;
        events.push({kind: 'text', payload: {text: entry.text}});
        // The script is what a model would have said, so it is reported the way a delta would be.
        report('message', {text: entry.text});
    }
    // A finished dialogue starts over next time; a parked one keeps its cursor for the resume.
    if (!suspended) {
        cursors.delete(key);
        report('status', {state: 'finished'});
    }
    return {
        text,
        sessionKey: `sim-${key}`,
        finishReason: suspended ? 'suspended' : 'stop',
        events,
        ...(suspended && {suspended}),
    };
};
