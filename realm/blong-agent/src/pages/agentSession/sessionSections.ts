/**
 * Sections of a session, reduced from its telemetry (`@@T-798`).
 *
 * The stream is what a page reads and the projection is what a list reads, so the shape a page
 * renders has to be derived from the events themselves: a delta appends to the open section of its
 * kind, a tool call opens a card that its result closes, and everything but the newest section is
 * collapsed. Reducing is a pure function of `(sections, events)`, which is what makes replay-then-live
 * and live-from-start the same list — the page cannot tell a tail from a subscription.
 *
 * No import: this module runs in the browser bundle and in a tap test alike, and the realm's events
 * are a plain shape rather than a class.
 */

/** One telemetry event, as a feed frame carries it. */
export interface ISessionEvent {
    /** The order the topic gave it, used only to keep a reduction stable. */
    seq?: number;
    /** `reasoning`, `message`, `text`, `tool`, `tool-result`, `status`, … */
    kind: string;
    payload?: unknown;
    /** When the engine reported it, in epoch milliseconds. */
    at?: number;
}

export type SessionSectionKind = 'reasoning' | 'message' | 'tool' | 'note';

export interface ISessionSection {
    /** Stable across reductions of the same events, so React keys do not churn. */
    key: string;
    kind: SessionSectionKind;
    /** A tool's name, or the state a note reports. */
    title?: string;
    /** The running text of a reasoning or message section, or a note's line. */
    text: string;
    /** A tool's arguments, as the engine reported them. */
    args?: string;
    /** A tool's result, once it has one. */
    result?: string;
    /** The tool call this section answers, so a result finds its own card. */
    toolCallId?: string;
    /** Whether the card shows its body. Only the newest section is open. */
    open: boolean;
    /** When the section began, and when a tool finished. */
    startedAt?: number;
    endedAt?: number;
    /** How long the tool itself says it took, when its result carries the number. The event pair is
     * only as accurate as the two writes, and a batch written together makes them equal. */
    durationMs?: number;
    /** Whether the section is complete: a text section grows until another kind interrupts it, a tool
     * card is complete once its result arrived. */
    done: boolean;
}

const textOf = (payload: unknown): string => {
    if (typeof payload === 'string') return payload;
    const text = (payload as {text?: unknown} | undefined)?.text;
    return typeof text === 'string' ? text : '';
};

/** A payload rendered for reading: strings stay, everything else is JSON. */
const renderOf = (value: unknown): string | undefined => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
};

/**
 * The states a person has to act on, and therefore the states a transcript draws.
 *
 * `running` and `done` are not among them: the status bar carries both, and a run in progress shows
 * itself as a cursor. The rest stop a session and wait for someone (`@@D-1010`).
 */
const NOTABLE_STATES = ['awaiting', 'failed', 'error', 'suspended', 'aborted', 'blocked'];

/**
 * What a note says: the words a payload carries, or the payload itself.
 *
 * A state event is the one thing a session reports that a person has to act on — the question it is
 * waiting for is in `question` or `text`, and printing the envelope around it would hide the question
 * behind braces. Anything else is shown as the JSON it arrived as, so nothing is lost.
 */
const noteTextOf = (payload: unknown): string => {
    const said = (payload as {text?: unknown; question?: unknown; message?: unknown} | undefined)
        ?.text;
    const question = (payload as {question?: unknown} | undefined)?.question;
    const message = (payload as {message?: unknown} | undefined)?.message;
    if (typeof said === 'string' && said !== '') return said;
    if (typeof question === 'string' && question !== '') return question;
    if (typeof message === 'string' && message !== '') return message;
    // A state and nothing else is already the title: printing `{"state":"running"}` under a heading
    // that says `running` is the envelope read aloud.
    const keys = Object.keys((payload as Record<string, unknown> | undefined) ?? {});
    if (keys.length > 0 && keys.every(key => key === 'state')) return '';
    return renderOf(payload) ?? '';
};

const toolNameOf = (payload: unknown): string | undefined => {
    const name = (payload as {toolName?: unknown} | undefined)?.toolName;
    return typeof name === 'string' && name !== '' ? name : undefined;
};

const toolCallIdOf = (payload: unknown): string | undefined => {
    const id = (payload as {toolCallId?: unknown} | undefined)?.toolCallId;
    return typeof id === 'string' && id !== '' ? id : undefined;
};

/** The section a text kind appends to, when the newest one is of the same kind. */
const APPENDS: Record<string, SessionSectionKind> = {
    reasoning: 'reasoning',
    thinking: 'reasoning',
    message: 'message',
    text: 'message',
};

/**
 * Fold one event into the sections.
 *
 * Returns a new array and never mutates the one it was given: a React state holder replaces the
 * list, and a reducer that edited in place would render from an object that did not change.
 */
export const sessionSectionsReduce = (
    sections: readonly ISessionSection[],
    event: ISessionEvent,
): ISessionSection[] => {
    const next = sections.map(section => ({...section}));
    const collapse = (): void => {
        for (const section of next) section.open = false;
    };
    const kind = APPENDS[event.kind];
    if (kind) {
        const text = textOf(event.payload);
        if (text === '') return next;
        const last = next[next.length - 1];
        if (last && last.kind === kind) {
            last.text += text;
            return next;
        }
        collapse();
        next.push({
            key: `${kind}-${event.seq ?? next.length}`,
            kind,
            text,
            open: true,
            done: false,
            startedAt: event.at,
        });
        return next;
    }

    if (event.kind === 'tool') {
        collapse();
        next.push({
            key: `tool-${toolCallIdOf(event.payload) ?? event.seq ?? next.length}`,
            kind: 'tool',
            title: toolNameOf(event.payload) ?? 'tool',
            text: '',
            args: renderOf(
                (event.payload as {args?: unknown; arguments?: unknown} | undefined)?.args ??
                    (event.payload as {arguments?: unknown} | undefined)?.arguments,
            ),
            toolCallId: toolCallIdOf(event.payload),
            open: true,
            done: false,
            startedAt: event.at,
        });
        return next;
    }

    if (event.kind === 'tool-result') {
        const id = toolCallIdOf(event.payload);
        // The result belongs to its own call: an id is what says which card to close. Without one
        // it is the newest tool still waiting, which is what a stream produced in order means.
        const target = id
            ? [...next]
                  .reverse()
                  .find(section => section.kind === 'tool' && section.toolCallId === id)
            : [...next].reverse().find(section => section.kind === 'tool' && !section.done);
        if (target) {
            target.result = renderOf(
                (event.payload as {result?: unknown} | undefined)?.result ?? event.payload,
            );
            target.done = true;
            // A card that answered folds to one line, which is the newest section's rule applied to
            // it: the reader asked for a result, not for a second body.
            target.open = false;
            target.endedAt = event.at;
            const reported = (event.payload as {durationMs?: unknown} | undefined)?.durationMs;
            if (typeof reported === 'number' && Number.isFinite(reported))
                target.durationMs = reported;
            return next;
        }
        collapse();
        next.push({
            key: `tool-result-${event.seq ?? next.length}`,
            kind: 'note',
            title: 'tool result',
            text: renderOf(event.payload) ?? '',
            open: true,
            done: true,
            startedAt: event.at,
        });
        return next;
    }

    if (event.kind === 'status') {
        const state = (event.payload as {state?: unknown} | undefined)?.state;
        // A state that carries nothing but its name is already on the status bar, so a
        // transcript that drew it too would say "running" twice and bury the work between.
        // A state carrying words — the question a run stopped on, why it failed — is the
        // one thing a reader has to act on, and it is drawn as a callout (`@@D-1010`).
        if (typeof state === 'string' && NOTABLE_STATES.indexOf(state) < 0) {
            const text = noteTextOf(event.payload);
            if (text === '') return next;
        }
        collapse();
        next.push({
            key: `status-${event.seq ?? next.length}`,
            kind: 'note',
            title: typeof state === 'string' ? state : 'status',
            text: noteTextOf(event.payload),
            open: true,
            done: true,
            startedAt: event.at,
        });
        return next;
    }

    // Any other kind is still news worth a line: a page that dropped it would show a session that
    // went quiet exactly where the engine reported something it did not model.
    collapse();
    next.push({
        key: `${event.kind}-${event.seq ?? next.length}`,
        kind: 'note',
        title: event.kind,
        text: noteTextOf(event.payload),
        open: true,
        done: true,
        startedAt: event.at,
    });
    return next;
};

/** Fold a sequence in order — the same result whether it arrives in one batch or many. */
export const sessionSectionsOf = (
    events: readonly ISessionEvent[],
    seed: readonly ISessionSection[] = [],
): ISessionSection[] => events.reduce(sessionSectionsReduce, [...seed]);

/** How many sections carry text the reader can see without expanding a card. */
export const sessionSectionsOpen = (sections: readonly ISessionSection[]): number =>
    sections.filter(section => section.open).length;
