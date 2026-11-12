/**
 * The decisions and frictions a plan collects while it is being executed.
 *
 * A task becomes a todo the moment the plan is approved, but a decision is taken and a friction is
 * hit *during* the work — and until a reader opens the memory files they are invisible. This section
 * puts them on the board: one line per entry, linked the way a task line is, with the status a reader
 * can see at a glance (`@@D-815`).
 *
 * The section is tool-owned. `blong-dev memory add --plan <plan>` appends a line when the entry is
 * written; `memory close` refreshes the line its four-line neighbour already has; `plan sync` re-reads
 * every line against the memory and rewrites the link, the title and the status. A hand-written
 * bullet in this section is kept as it is, because a plan is prose and only the lines that name an
 * entry are rewritten.
 */

import type {IMemoryEntryView} from '../memory/memoryView.ts';
import {entryLink} from './planLinks.ts';
import type {IPlanDocument} from './planParse.ts';

/** The heading the tool maintains. `plan` writes it when the first entry arrives. */
export const PLAN_ENTRIES_HEADING = '## Decisions and frictions';

/** The heading itself, exactly — a `## Decisions and frictions, revised` is prose. */
const HEADING_LINE = /^##\s+Decisions and frictions\s*$/;

/** Any other second-level heading ends the section. */
const ANY_H2 = /^##\s/;

/** A line this module owns: `- [@@D-811](link) title · status`. */
const ENTRY_LINE = /^-\s+\[?@@(?<id>[FD]-\d{3})\b/;

/** The part of an entry this module reads. */
export type IPlanEntryView = Pick<IMemoryEntryView, 'id' | 'title' | 'status' | 'path'>;

/** Where the section starts and where its content ends. */
export interface IPlanSection {
    /** 0-based index of the heading. */
    line: number;
    /** 0-based index of the first line after the section. */
    end: number;
}

/** The section's bounds, or `undefined` when the plan has none. */
export function planSectionBounds(doc: IPlanDocument): IPlanSection | undefined {
    const line = doc.lines.findIndex(text => HEADING_LINE.test(text));
    if (line === -1) return undefined;
    for (let index = line + 1; index < doc.lines.length; index += 1) {
        if (ANY_H2.test(doc.lines[index] ?? '')) return {line, end: index};
    }
    return {line, end: doc.lines.length};
}

/** The ids the section lists, in the order a reader sees them. */
export function planEntryIds(doc: IPlanDocument): string[] {
    const bounds = planSectionBounds(doc);
    if (!bounds) return [];
    const ids: string[] = [];
    for (let index = bounds.line + 1; index < bounds.end; index += 1) {
        const match = ENTRY_LINE.exec(doc.lines[index] ?? '');
        const id = match?.groups?.['id'];
        if (id) ids.push(id);
    }
    return ids;
}

/** The line an entry gets: the same link a task carries, then the title and the status. */
export function planEntryLine(root: string, planPath: string, entry: IPlanEntryView): string {
    return `- [@@${entry.id}](${entryLink(root, planPath, entry)}) ${entry.title} · ${entry.status}`;
}

/**
 * Put an entry's line in the section, creating the section when it is absent.
 *
 * A line that already names the id is replaced rather than repeated, so running the command twice
 * (or after an edit) leaves one line per entry.
 */
export function addPlanEntry(doc: IPlanDocument, id: string, line: string): IPlanDocument {
    const lines = [...doc.lines];
    const bounds = planSectionBounds(doc);
    if (!bounds) {
        while (lines.length > 0 && (lines[lines.length - 1] ?? '').trim() === '') lines.pop();
        lines.push('', PLAN_ENTRIES_HEADING, '', line, '');
        return {...doc, lines};
    }

    const existing = lines.findIndex(
        (text, index) => index > bounds.line && index < bounds.end && names(text, id),
    );
    if (existing !== -1) {
        lines[existing] = line;
        return {...doc, lines};
    }

    // After the last bullet, so an empty section keeps its blank line after the heading.
    let at = bounds.end;
    while (at - 1 > bounds.line && (lines[at - 1] ?? '').trim() === '') at -= 1;
    lines.splice(at, 0, line);
    return {...doc, lines};
}

/** Whether a line names an id. */
function names(text: string, id: string): boolean {
    return ENTRY_LINE.exec(text)?.groups?.['id'] === id;
}

/** What a refresh did, and what it could not do. */
export interface IRefreshResult {
    doc: IPlanDocument;
    /** Ids whose line changed. */
    refreshed: string[];
    /** Ids the memory no longer holds, kept as they were. */
    missing: string[];
}

/**
 * Re-read every line in the section against the memory.
 *
 * The link carries the entry's title in its anchor, so a retitled or closed entry needs a new line
 * rather than a status edited in place. An entry that is gone is reported and its line left alone:
 * deleting it would lose the record of a decision that was retired, and `plan check` is where the
 * dangling reference is an error.
 */
export function refreshPlanEntries(
    doc: IPlanDocument,
    root: string,
    entries: ReadonlyMap<string, IPlanEntryView>,
): IRefreshResult {
    const bounds = planSectionBounds(doc);
    if (!bounds) return {doc, refreshed: [], missing: []};
    const lines = [...doc.lines];
    const refreshed: string[] = [];
    const missing: string[] = [];
    for (let index = bounds.line + 1; index < bounds.end; index += 1) {
        const id = ENTRY_LINE.exec(lines[index] ?? '')?.groups?.['id'];
        if (!id) continue;
        const entry = entries.get(id);
        if (!entry) {
            missing.push(id);
            continue;
        }
        const line = planEntryLine(root, doc.path, entry);
        if (line === lines[index]) continue;
        lines[index] = line;
        refreshed.push(id);
    }
    return {doc: {...doc, lines}, refreshed, missing};
}
