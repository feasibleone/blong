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

import type {ISessionSection} from './sessionSections.ts';

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
    (section.startedAt !== undefined && section.endedAt !== undefined && section.endedAt >= section.startedAt
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
