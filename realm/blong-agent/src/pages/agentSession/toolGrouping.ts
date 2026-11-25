/**
 * The transcript as rows, with a run of tool calls as one row (`@@D-1010`).
 *
 * A session that works makes its calls in runs, and a card per call turns a turn's work into a wall
 * of near-identical boxes. So a run of two or more consecutive tool calls is one row whose header
 * says what the run did — `Used 3 tools · bash ×2, edit` — and whose body is a line per call. A lone
 * call stays a card of its own: there is nothing to summarise, and a group of one is a box around a
 * box.
 *
 * This is the shape CopilotKit's `CopilotChatMessageView` calls `toolCallDisplay: 'grouped'`, and it
 * is a pure function of the reduced sections so the grouping can be asserted without a browser.
 */

import {diffStatsOf, type ISessionSection, type ISessionToolDetail} from './sessionSections.ts';

/**
 * What a tool call is, by the names the two engine vocabularies use.
 *
 * A step engine calls the realm's tools (`runCommand`, `writeFile`, `readFile`) and a copilot runtime
 * calls its own (`bash`, `create`, `view`, `edit`), and a page that drew both as JSON drew neither
 * (`@@T-824`).
 */
export type ToolKind = 'shell' | 'write' | 'edit' | 'read' | 'ask' | 'other';

const TOOL_KINDS: Record<string, ToolKind> = {
    bash: 'shell',
    shell: 'shell',
    powershell: 'shell',
    runCommand: 'shell',
    command: 'shell',
    create: 'write',
    write: 'write',
    writeFile: 'write',
    edit: 'edit',
    replace: 'edit',
    strReplace: 'edit',
    applyPatch: 'edit',
    view: 'read',
    read: 'read',
    readFile: 'read',
    listFiles: 'read',
    askHuman: 'ask',
    ask: 'ask',
};

export const toolKindOf = (name: string | undefined): ToolKind =>
    (name !== undefined && TOOL_KINDS[name]) || 'other';

/** The language a file's own name asks the highlighter for. */
export const languageOfPath = (path: string | undefined): string => {
    const extension = /\.([A-Za-z0-9]+)$/.exec(path ?? '')?.[1]?.toLowerCase();
    return extension ?? 'text';
};

/**
 * How big a call was, in the one number a header has room for.
 *
 * A shell says `exit 0`, because the exit code is the outcome. A write or an edit says `+3 −1` from
 * the diff the runtime returned, or its size when there is no diff to count. A read says how long
 * the file is. Anything else says nothing, and a row with no badge is a row that has nothing to
 * summarise (`@@T-824`).
 */
/** How long a call has to run before its time is worth a reader's attention (`@@T-827`). */
export const SLOW_MS = 30_000;

/**
 * How long something took, in the unit a reader wants.
 *
 * A transcript is mostly quick calls, and `0 ms` beside every one of them is noise that pushed the
 * one slow command into the same blur: a time under a second is not shown at all, a longer one is
 * shown in seconds, and a minute or more keeps its minutes because `187.4s` is a number nobody
 * divides in their head (`@@T-827`).
 */
export const elapsedOf = (ms: number | undefined): string => {
    if (ms === undefined || !Number.isFinite(ms) || ms < 1_000) return '';
    if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60_000);
    const seconds = Math.round((ms % 60_000) / 1_000);
    return `${minutes}m ${seconds}s`;
};

/** Whether a call's time is worth marking as slow. */
export const isSlow = (ms: number | undefined): boolean =>
    ms !== undefined && Number.isFinite(ms) && ms > SLOW_MS;

export const toolStatsOf = (
    name: string | undefined,
    detail: ISessionToolDetail | undefined,
): string => {
    const kind = toolKindOf(name);
    if (kind === 'shell') return detail?.exitCode === undefined ? '' : `exit ${detail.exitCode}`;
    // A read answers with a diff-shaped snapshot of the file, and counting that as a change says
    // `+0 −0` for every read anybody made (`@@T-824`).
    if (kind === 'read') {
        const read = detail?.content;
        if (read === undefined) return '';
        const lines = read === '' ? 0 : read.split('\n').length;
        return `${lines} line${lines === 1 ? '' : 's'} · ${read.length} B`;
    }
    if (detail?.diff !== undefined) {
        const {added, removed} = diffStatsOf(detail.diff);
        return `+${added} −${removed}`;
    }
    if (kind === 'write' || kind === 'edit') {
        const text = detail?.content;
        if (text === undefined) return '';
        const lines = text === '' ? 0 : text.split('\n').length;
        return `${lines} line${lines === 1 ? '' : 's'} · ${text.length} B`;
    }
    return '';
};

export type SessionRow =
    | {kind: 'section'; key: string; section: ISessionSection}
    | {
          kind: 'tools';
          key: string;
          calls: ISessionSection[];
          /** `Used 3 tools · bash ×2, edit`. */
          title: string;
          /** The run's own time: the sum of the calls it made. */
          durationMs: number;
          /** Whether every call in the run has answered. */
          done: boolean;
      };

/** `bash ×2, edit` — each tool once, in the order it was first called. */
export const toolRunSummary = (calls: readonly ISessionSection[]): string => {
    const counts = new Map<string, number>();
    for (const call of calls) {
        const name = call.title ?? 'tool';
        counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const named = [...counts.entries()]
        .map(([name, count]) => (count > 1 ? `${name} ×${count}` : name))
        .join(', ');
    return `Used ${calls.length} tool${calls.length === 1 ? '' : 's'} · ${named}`;
};

/** The number the tool reported, or the distance between its two events. */
const durationOf = (section: ISessionSection): number =>
    section.durationMs ??
    (section.startedAt !== undefined &&
    section.endedAt !== undefined &&
    section.endedAt >= section.startedAt
        ? section.endedAt - section.startedAt
        : 0);

/**
 * The sections, with runs of tool calls folded into one row each.
 *
 * Order is preserved and nothing is dropped: the rows are a view of the same list, so replay-then-live
 * still matches live-from-start.
 */
export const sessionRowsOf = (sections: readonly ISessionSection[]): SessionRow[] => {
    const rows: SessionRow[] = [];
    let index = 0;
    while (index < sections.length) {
        const section = sections[index] as ISessionSection;
        if (section.kind !== 'tool') {
            rows.push({kind: 'section', key: section.key, section});
            index += 1;
            continue;
        }
        const calls: ISessionSection[] = [section];
        let cursor = index + 1;
        while (sections[cursor]?.kind === 'tool') {
            calls.push(sections[cursor] as ISessionSection);
            cursor += 1;
        }
        if (calls.length === 1) rows.push({kind: 'section', key: section.key, section});
        else
            rows.push({
                kind: 'tools',
                key: `tools-${section.key}`,
                calls,
                title: toolRunSummary(calls),
                durationMs: calls.reduce((sum, call) => sum + durationOf(call), 0),
                done: calls.every(call => call.done),
            });
        index = cursor;
    }
    return rows;
};
