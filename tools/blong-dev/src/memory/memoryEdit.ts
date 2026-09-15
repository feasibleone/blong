/**
 * Writing memory files: skeletons, entries, ids and the small set of edits the
 * CLI performs (insert, close, reopen, move).
 *
 * Every edit is a line splice on the parsed document, so an entry that is not
 * being touched keeps its bytes. Files are written through `renderLines`, which
 * normalises blank runs and guarantees exactly one trailing newline.
 */

import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname} from 'node:path';

import {formatLines, renderLines, trimBlankRuns, wrapText} from './memoryFormat.ts';
import {withRefreshedIndex} from './memoryIndex.ts';
import {parseDoc, parseMeta, readDoc, renderMeta} from './memoryParse.ts';
import {listMemoryFiles, memoryFile, scopeDir, scopeOf} from './memoryPaths.ts';
import {
    KIND_FILE,
    KIND_PREFIX,
    KIND_PURPOSE,
    KIND_TITLE,
    MAX_LINE_LENGTH,
    SECTION_FOR_STATUS,
    SKELETON_SECTIONS,
    type IMemoryDoc,
    type IMemoryEntry,
    type IMemoryMeta,
    type IMemorySection,
    type IMemoryStructure,
    type MemoryKind,
} from './memoryTypes.ts';

/** The header lines of a fresh file, index block excluded. */
export function skeleton(kind: MemoryKind, scope: string): string[] {
    const heading = scope === 'root' ? `# ${KIND_TITLE[kind]}` : `# ${KIND_TITLE[kind]} — ${scope}`;
    const purpose =
        scope === 'root'
            ? `${KIND_PURPOSE[kind]} Cross-cutting entries only: anything specific to one package belongs in that package's \`.github/memory/${KIND_FILE[kind]}\`.`
            : `${KIND_PURPOSE[kind]} Entries here concern \`${scope}\`; anything cross-cutting belongs in the repository-root memory.`;
    const lines: string[] = [heading, '', ...wrapText(purpose), ''];
    for (const section of SKELETON_SECTIONS[kind]) lines.push(`## ${section}`, '');
    return trimBlankRuns(lines);
}

/** `### F-014 — realm add is not idempotent` plus meta and body. */
export function entryLines(
    id: string,
    title: string,
    meta: IMemoryMeta,
    body: readonly string[],
): string[] {
    // A blank line under the heading is what markdownlint's MD022 asks for.
    return [`### ${id} — ${title}`, '', renderMeta(meta), '', ...body];
}

/**
 * Rewrite an entry's meta line in place.
 *
 * Used when only the area changes and the entry stays exactly where it is — a
 * move between two root areas, for instance, which live in the same file.
 */
export function replaceMeta(doc: IMemoryDoc, entry: IMemoryEntry, meta: IMemoryMeta): void {
    for (let line = entry.start + 1; line <= entry.end; line += 1) {
        if (parseMeta(doc.lines[line] ?? '') !== null) {
            doc.lines[line] = renderMeta(meta);
            return;
        }
    }
    doc.lines.splice(entry.start + 1, 0, renderMeta(meta));
}

/** Append an empty section at the end of the file. */
export function appendSection(lines: readonly string[], heading: string): string[] {
    const next = [...lines];
    while (next.length > 0 && next[next.length - 1]?.trim() === '') next.pop();
    next.push('', `## ${heading}`, '');
    return next;
}

/** Insert a block at the end of a section, creating the section when missing. */
export function insertEntry(doc: IMemoryDoc, heading: string, block: readonly string[]): void {
    let structure = parseDoc(doc.lines);
    let section = structure.sections.find(candidate => candidate.heading === heading);
    if (!section) {
        doc.lines = appendSection(doc.lines, heading);
        structure = parseDoc(doc.lines);
        section = structure.sections.find(candidate => candidate.heading === heading)!;
    }
    const at = section.end + 1;
    const before = doc.lines[at - 1];
    const lead = before !== undefined && before.trim() !== '' ? [''] : [];
    doc.lines.splice(at, 0, ...lead, ...block, '');
}

/** Remove an entry, leaving the surrounding blank lines to `renderLines`. */
export function removeEntry(doc: IMemoryDoc, entry: IMemoryEntry): void {
    doc.lines.splice(entry.start, entry.end - entry.start + 1);
}

/** The section an entry with this status belongs in. */
export function sectionForStatus(status: string): string {
    return SECTION_FOR_STATUS[status] ?? 'Open';
}

/** The paragraph lines of a body supplied as text. */
export function bodyLines(text: string): string[] {
    if (text.trim() === '') return [];
    return formatLines(text.replace(/\r\n/g, '\n').split('\n'), MAX_LINE_LENGTH);
}

/** Read a memory file, creating it from the skeleton when it does not exist. */
export function ensureDoc(root: string, area: string, kind: MemoryKind): IMemoryDoc {
    const path = memoryFile(root, area, kind);
    const scope = scopeOf(area);
    if (existsSync(path)) return readDoc(path, kind, scope);

    mkdirSync(scopeDir(root, scope), {recursive: true});
    const doc: IMemoryDoc = {path, kind, scope, lines: skeleton(kind, scope)};
    refreshIndex(doc);
    writeDoc(doc);
    return doc;
}

/** Rebuild the index block of a document in place. */
export function refreshIndex(doc: IMemoryDoc): void {
    doc.lines = withRefreshedIndex(doc.lines, parseDoc(doc.lines), doc.kind);
}

/**
 * Re-render every entry from its parsed parts.
 *
 * The entry format belongs to the CLI, so a change to it (the meta line becoming
 * a blockquote, a blank line under the heading) has to reach files that were
 * written by an older version — otherwise the repository keeps two shapes of the
 * same format and markdownlint keeps complaining about the old one.
 */
export function canonicalise(doc: IMemoryDoc): void {
    const structure = parseDoc(doc.lines);
    // Backwards: re-rendering an entry moves the lines of the ones after it.
    for (const entry of [...structure.entries].reverse()) {
        if (entry.id === undefined || entry.meta === null) continue;
        doc.lines.splice(
            entry.start,
            entry.end - entry.start + 1,
            ...entryLines(
                entry.id,
                entry.title,
                entry.meta,
                formatLines(entry.body, MAX_LINE_LENGTH),
            ),
        );
    }
    refreshIndex(doc);
}

/**
 * Find or create the `## Manual` section, just below the index block.
 *
 * The section is looked up *after* the refresh: the refresh can move it (the
 * index block has to sit above the first section), and a line range taken before
 * that is stale — using it would splice the items into the index block, where the
 * next refresh deletes them.
 */
export function ensureManualSection(doc: IMemoryDoc): IMemorySection {
    let structure = parseDoc(doc.lines);
    const existing = structure.sections.find(candidate => candidate.heading === 'Manual');
    if (existing) return existing;
    const at = structure.indexRange
        ? structure.indexRange[1] + 1
        : (structure.sections[0]?.start ?? doc.lines.length);
    doc.lines.splice(at, 0, '', '## Manual', '');
    refreshIndex(doc);
    structure = parseDoc(doc.lines);
    return structure.sections.find(candidate => candidate.heading === 'Manual')!;
}

/**
 * Normalise a manual item into a checkbox bullet: `- [ ] text`.
 *
 * A manual item may carry more than one line (a fenced example under the item),
 * so only the first line is rewritten; the rest is kept verbatim.
 */
export function manualItem(text: string): string {
    const [first = '', ...rest] = text.replace(/\r\n/g, '\n').split('\n');
    const clean = first
        .replace(/^[-*]\s*/, '')
        .replace(/^\[\s*\]\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();
    const tail = rest.join('\n').replace(/\s+$/, '');
    return tail === '' ? `- [ ] ${clean}` : `- [ ] ${clean}\n${tail}`;
}

/** Append manual items to a document's manual section, wrapping long prose. */
export function addManualItems(doc: IMemoryDoc, items: readonly string[]): void {
    if (items.length === 0) return;
    const block: string[] = [];
    for (const item of items) {
        if (block.length > 0) block.push('');
        block.push(...formatLines(manualItem(item).split('\n'), MAX_LINE_LENGTH));
    }
    const section = ensureManualSection(doc);
    // A blank line between the heading and the list, and one after it.
    const at = section.end + 1;
    if ((doc.lines[at] ?? '').trim() !== '') block.unshift('');
    doc.lines.splice(at, 0, ...block, '');
    refreshIndex(doc);
}

/** One entry of an authored batch. */
export interface IBatchEntry {
    title: string;
    body: string;
    area: string;
    status: string;
    date: string;
}

/** What a batch produced, in the order it was authored. */
export interface IBatchResult {
    id: string;
    path: string;
    area: string;
    title: string;
}

/**
 * Write a batch of authored entries, ids allocated in batch order.
 *
 * The batch is grouped by *target file*, not by area: every root area
 * (`cross-cutting`, `ci`, …) lives in the same document, so a per-area write
 * would rebuild that document and lose the entries written before it.
 */
export function applyEntries(
    root: string,
    kind: MemoryKind,
    entries: readonly IBatchEntry[],
    manual: readonly string[] = [],
): IBatchResult[] {
    const byFile = new Map<string, {area: string; entries: IBatchEntry[]}>();
    for (const entry of entries) {
        const file = memoryFile(root, entry.area, kind);
        const bucket = byFile.get(file) ?? {area: entry.area, entries: []};
        bucket.entries.push(entry);
        byFile.set(file, bucket);
    }

    // A batch may carry nothing but the user's own items.
    if (byFile.size === 0) {
        if (kind !== 'todo' || manual.length === 0) return [];
        const doc = ensureDoc(root, 'cross-cutting', kind);
        addManualItems(doc, manual);
        refreshIndex(doc);
        writeDoc(doc);
        return [];
    }
    const applied: IBatchResult[] = [];
    let counter = highestId(root, kind);
    for (const [, bucket] of byFile) {
        const doc = ensureDoc(root, bucket.area, kind);
        for (const entry of bucket.entries) {
            counter += 1;
            const id = formatId(kind, counter);
            insertEntry(
                doc,
                sectionForStatus(entry.status),
                entryLines(
                    id,
                    entry.title,
                    {date: entry.date, area: entry.area, status: entry.status},
                    bodyLines(entry.body),
                ),
            );
            applied.push({id, path: doc.path, area: entry.area, title: entry.title});
        }
        refreshIndex(doc);
        writeDoc(doc);
    }

    // The user's own list always belongs to the root document, whatever the batch
    // was about. Re-read it when the loop above already wrote it.
    if (kind === 'todo' && manual.length > 0) {
        const doc = ensureDoc(root, 'cross-cutting', kind);
        addManualItems(doc, manual);
        refreshIndex(doc);
        writeDoc(doc);
    }
    return applied;
}

/** Write a document to disk with the canonical line endings and trailing newline. */
export function writeDoc(doc: IMemoryDoc): void {
    mkdirSync(dirname(doc.path), {recursive: true});
    writeFileSync(doc.path, renderLines(doc.lines));
}

/** Id for a kind and a number: `F-014`. */
export function formatId(kind: MemoryKind, value: number): string {
    return `${KIND_PREFIX[kind]}-${String(value).padStart(3, '0')}`;
}

/** Highest id number already in use for a kind, across every memory file. */
export function highestId(root: string, kind: MemoryKind): number {
    const prefix = KIND_PREFIX[kind];
    const pattern = new RegExp(`^###\\s+(${prefix}-\\d{3})\\b`, 'gm');
    let highest = 0;
    for (const file of listMemoryFiles(root)) {
        if (file.kind !== kind) continue;
        for (const match of readFileSync(file.path, 'utf8').matchAll(pattern)) {
            const value = Number(match[1]?.split('-')[1] ?? 0);
            if (Number.isFinite(value)) highest = Math.max(highest, value);
        }
    }
    return highest;
}

/** Next free id for a kind, scanning every memory file in the workspace. */
export function nextId(root: string, kind: MemoryKind): string {
    return formatId(kind, highestId(root, kind) + 1);
}

/** Structure of a document, for callers that need both. */
export function parseDocOf(doc: IMemoryDoc): IMemoryStructure {
    return parseDoc(doc.lines);
}
