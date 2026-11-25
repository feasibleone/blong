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
    /** What the call did, read from its payloads instead of printed as JSON (`@@T-824`). */
    detail?: ISessionToolDetail;
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

/**
 * A tool call as the page draws it, rather than as the JSON it arrived in.
 *
 * The two engines name the same work differently and their payloads carry different shapes: the realm
 * tools take `path`/`content`, the copilot runtime's take `path`/`file_text` for a write and
 * `old_str`/`new_str` for an edit, and a shell call's answer holds its exit code beside its output
 * with a `<shellId: …>` trailer glued on. This is that difference read once, so a row can say "bash,
 * exit 0, four lines" instead of showing braces (`@@T-824`).
 */
export interface ISessionToolDetail {
    /** The command line a shell tool was asked to run. */
    command?: string;
    /** What the model said the call was for. */
    description?: string;
    /** The shell's exit code, where the runtime reported one. */
    exitCode?: number;
    /** Whether the tool called itself successful. */
    success?: boolean;
    /** The file the call touched. */
    path?: string;
    /** What a write put in the file. */
    content?: string;
    /** The two sides an edit named. */
    oldText?: string;
    newText?: string;
    /** The unified diff the runtime returned for a write or an edit. */
    diff?: string;
    /** A shell's output, without the runtime's own trailer. */
    output?: string;
    /** A question put to a person, the options it offered, and what they answered. */
    question?: string;
    options?: string[];
    answer?: string;
}

const stringAt = (
    record: Record<string, unknown> | undefined,
    ...keys: string[]
): string | undefined => {
    for (const key of keys) {
        const value = record?.[key];
        if (typeof value === 'string' && value !== '') return value;
    }
    return undefined;
};

const recordAt = (value: unknown): Record<string, unknown> | undefined =>
    value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;

/** A call's arguments, in either vocabulary the engine kinds use. */
const argumentsOf = (payload: unknown): Record<string, unknown> | undefined => {
    const record = recordAt(payload);
    return recordAt(record?.arguments) ?? recordAt(record?.args);
};

/**
 * A shell's answer with the runtime's trailer removed.
 *
 * A copilot shell result ends with `<shellId: 13 completed with exit code 0>`, which is the runtime
 * talking to itself: the exit code is a field of the same payload and belongs in a pill, not in the
 * output a reader is reading. The id is a number for one runtime and a name for another, so the
 * trailer is matched on its shape.
 */
export const shellOutputOf = (text: string): string =>
    text
        .split('\n')
        .filter(line => !/^\s*<shellId: .*completed with exit code -?\d+>\s*$/.test(line))
        .join('\n')
        .replace(/\n+$/, '');

/** Whether a result's `detailedContent` is a unified diff rather than prose. */
const looksLikeDiff = (text: string): boolean => /(^|\n)(diff --git |@@ -)/.test(text);

/**
 * A result whose `content` is a JSON object as text.
 *
 * The copilot runtime reports whatever a custom tool returned as a stringified object —
 * `{"promptId":…,"answerText":"yes"}` — so a person's answer is one parse away rather than a field
 * beside the content (`@@T-824`).
 */
const wrappedOf = (content: string | undefined): Record<string, unknown> | undefined => {
    if (content === undefined || !content.trimStart().startsWith('{')) return undefined;
    try {
        return recordAt(JSON.parse(content));
    } catch {
        return undefined;
    }
};

/** The lines a diff adds and removes, which is the size of a change at a glance. */
export const diffStatsOf = (diff: string): {added: number; removed: number} => {
    let added = 0;
    let removed = 0;
    for (const line of diff.split('\n')) {
        if (line.startsWith('+++') || line.startsWith('---')) continue;
        if (line.startsWith('+')) added += 1;
        else if (line.startsWith('-')) removed += 1;
    }
    return {added, removed};
};

/** What a tool call's arguments say about it, before its result arrives. */
export const toolDetailOf = (payload: unknown): ISessionToolDetail | undefined => {
    const args = argumentsOf(payload);
    if (!args) return undefined;
    const options = Array.isArray(args.options) ? args.options.map(String) : undefined;
    const detail: ISessionToolDetail = {
        ...(stringAt(args, 'command') !== undefined && {command: stringAt(args, 'command')}),
        ...(stringAt(args, 'description') !== undefined && {
            description: stringAt(args, 'description'),
        }),
        ...(stringAt(args, 'path', 'filePath') !== undefined && {
            path: stringAt(args, 'path', 'filePath'),
        }),
        ...(stringAt(args, 'file_text', 'content', 'text') !== undefined && {
            content: stringAt(args, 'file_text', 'content', 'text'),
        }),
        ...(stringAt(args, 'old_str', 'old_string') !== undefined && {
            oldText: stringAt(args, 'old_str', 'old_string'),
        }),
        ...(stringAt(args, 'new_str', 'new_string') !== undefined && {
            newText: stringAt(args, 'new_str', 'new_string'),
        }),
        ...(stringAt(args, 'question') !== undefined && {question: stringAt(args, 'question')}),
        ...(options && options.length > 0 && {options}),
    };
    return Object.keys(detail).length > 0 ? detail : undefined;
};

/** What a tool call's result adds: an exit code, a diff, the output, the file it touched. */
export const toolResultDetailOf = (
    payload: unknown,
    current: ISessionToolDetail | undefined,
): ISessionToolDetail | undefined => {
    const record = recordAt(payload);
    if (!record) return current;
    const result = recordAt(record.result);
    const shell = recordAt(record.shellExecution);
    const edits = Array.isArray(record.fileEdits) ? record.fileEdits : [];
    const edited = recordAt(edits[0]);
    // A copilot shell reports its code inside `shellExecution`; the realm's own `runCommand` returns
    // it at the top level, and a page that knew only one shape showed no exit code for the other.
    const exitCode =
        typeof shell?.exitCode === 'number'
            ? shell.exitCode
            : typeof record.exitCode === 'number'
              ? record.exitCode
              : undefined;
    const content = stringAt(result ?? record, 'content');
    const detailed = stringAt(result ?? record, 'detailedContent');
    const diff = detailed !== undefined && looksLikeDiff(detailed) ? detailed.trim() : undefined;
    const output =
        content === undefined
            ? stringAt(result ?? record, 'stdout', 'output')
            : shellOutputOf(content);
    const answer =
        stringAt(result, 'answerText', 'answer') ??
        stringAt(wrappedOf(content), 'answerText', 'answer');
    // A read answers with the file as a diff-shaped snapshot, so the file itself is what its card
    // shows: the prose the runtime wrote about a write is not (`@@T-824`).
    const readText = content !== undefined && content !== '' ? content : undefined;
    const detail: ISessionToolDetail = {
        ...current,
        ...(exitCode !== undefined && {exitCode}),
        ...(typeof record.success === 'boolean' && {success: record.success}),
        ...(current?.path === undefined && stringAt(edited, 'path') !== undefined
            ? {path: stringAt(edited, 'path')}
            : {}),
        ...(diff !== undefined && {diff}),
        ...(answer !== undefined && {answer}),
        ...(current?.content === undefined &&
            readText !== undefined &&
            readText !== '' && {
                content: readText,
            }),
        // A shell's answer is its output; a file tool's is the prose the runtime wrote about it,
        // which says nothing a reader cannot see from the diff it also returned.
        ...(output !== undefined && exitCode !== undefined && output !== '' && {output}),
    };
    return Object.keys(detail).length > 0 ? detail : undefined;
};

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
 * Anything else is shown as the JSON it arrived as, so nothing is lost — a kind the page does not
 * model still says what the engine reported. A state does not come through here: it has a title
 * already, and its body is `stateDetailOf`.
 */
const noteTextOf = (payload: unknown): string => {
    const words = wordsOf(payload);
    if (words !== '') return words;
    // A state and nothing else is already the title: printing `{"state":"running"}` under a heading
    // that says `running` is the envelope read aloud.
    const keys = Object.keys((payload as Record<string, unknown> | undefined) ?? {});
    if (keys.length > 0 && keys.every(key => key === 'state')) return '';
    return renderOf(payload) ?? '';
};

/** The words a payload carries, when it carries any. */
const wordsOf = (payload: unknown): string => {
    const record = (payload as Record<string, unknown> | undefined) ?? {};
    for (const key of ['text', 'question', 'message', 'note']) {
        const said = record[key];
        if (typeof said === 'string' && said !== '') return said;
    }
    return '';
};

/**
 * What a state says beside its name, as one line (`@@T-820`).
 *
 * `{state: 'running', mode: 'native'}` is one fact worth reading and an envelope worth losing: the
 * title already says the state, so the body is the words the payload carries or its remaining
 * scalars as `key value` pairs — never the JSON, which is what a reader of the first native run was
 * shown. A state with nothing beside its name answers nothing, and the status bar is where it
 * already is.
 */
const stateDetailOf = (payload: unknown): string => {
    const words = wordsOf(payload);
    if (words !== '') return words;
    const record = payload as Record<string, unknown> | undefined;
    if (!record || typeof record !== 'object') return '';
    return Object.entries(record)
        .filter(
            ([key, value]) =>
                key !== 'state' &&
                (typeof value === 'string' ||
                    typeof value === 'number' ||
                    typeof value === 'boolean'),
        )
        .map(([key, value]) => `${key} ${String(value)}`)
        .join(' · ');
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
        for (const section of next) {
            section.open = false;
            // A text section grows until another kind interrupts it, and the interruption is what
            // completes it: a reasoning or a message that reported itself unfinished forever made a
            // chat view draw a cursor under every answer ever given (`@@T-814`).
            if (section.kind === 'reasoning' || section.kind === 'message') section.done = true;
        }
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
        const detail = toolDetailOf(event.payload);
        next.push({
            key: `tool-${toolCallIdOf(event.payload) ?? event.seq ?? next.length}`,
            kind: 'tool',
            title: toolNameOf(event.payload) ?? 'tool',
            text: '',
            args: renderOf(
                (event.payload as {args?: unknown; arguments?: unknown} | undefined)?.args ??
                    (event.payload as {arguments?: unknown} | undefined)?.arguments,
            ),
            ...(detail && {detail}),
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
            const detail = toolResultDetailOf(event.payload, target.detail);
            if (detail) target.detail = detail;
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
        const notable = typeof state === 'string' && NOTABLE_STATES.indexOf(state) >= 0;
        // A finished engine hands its answer to the status event, and that answer is the assistant's
        // message — headings, tables and fences included. Read as a note it was one plain paragraph
        // of literal markdown, so it is filed as a message and the page renders it as one
        // (`@@T-821`).
        const answer = state === 'finished' ? wordsOf(event.payload) : '';
        if (answer !== '') {
            collapse();
            next.push({
                key: `message-${event.seq ?? next.length}`,
                kind: 'message',
                text: answer,
                open: true,
                done: true,
                startedAt: event.at,
            });
            return next;
        }
        // A state carrying nothing but its name is already on the status bar, so a transcript that
        // drew it too would say "running" twice and bury the work between (`@@D-1010`). A state a
        // person has to act on keeps its row even when it says nothing else, because the state is
        // the news (`@@T-820`).
        const text = stateDetailOf(event.payload);
        if (text === '' && !notable) return next;
        collapse();
        next.push({
            key: `status-${event.seq ?? next.length}`,
            kind: 'note',
            title: typeof state === 'string' ? state : 'status',
            text,
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

/**
 * Append a frame's events to the ones already read, dropping an event that arrived twice (`@@T-822`).
 *
 * A page reads a tail and then a subscription, and the two can overlap: the same `seq` delivered
 * again becomes a second section carrying the same React key, which the browser reports as a
 * duplicate and may render twice or drop. The topic's order is the only identity an event has —
 * without a `seq` a repeat cannot be told from a twin, so such an event is kept.
 */
export const sessionEventsMerge = (
    current: readonly ISessionEvent[],
    incoming: readonly ISessionEvent[],
): ISessionEvent[] => {
    const seen = new Set<number>();
    for (const event of current) if (event.seq !== undefined) seen.add(event.seq);
    const fresh: ISessionEvent[] = [];
    for (const event of incoming) {
        if (event.seq !== undefined) {
            if (seen.has(event.seq)) continue;
            seen.add(event.seq);
        }
        fresh.push(event);
    }
    return fresh.length === 0 ? [...current] : [...current, ...fresh];
};

/** How many sections carry text the reader can see without expanding a card. */
export const sessionSectionsOpen = (sections: readonly ISessionSection[]): number =>
    sections.filter(section => section.open).length;
