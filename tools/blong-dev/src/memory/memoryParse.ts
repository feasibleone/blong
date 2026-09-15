/**
 * Reading a memory file into its structure.
 *
 * The file is never modelled as an object tree: structure is *derived* from the
 * raw lines, and every edit is a line splice. That is what keeps an `add` from
 * rewriting prose it did not touch.
 */

import {readFileSync} from 'node:fs';

import {
    ENTRY_HEADING,
    INDEX_END,
    INDEX_START,
    SECTION_HEADING,
    type IMemoryDoc,
    type IMemoryEntry,
    type IMemoryMeta,
    type IMemorySection,
    type IMemoryStructure,
    type MemoryKind,
} from './memoryTypes.ts';

const META = /^>?\s*_(?<date>\d{4}-\d{2}-\d{2})\s*·\s*(?<area>[^·]+?)\s*·\s*(?<status>[a-z]+)_$/;

/** Parse a `date · area · status` line, or `null` when it is not one. */
export function parseMeta(line: string): IMemoryMeta | null {
    const match = META.exec(line.trim());
    if (!match?.groups) return null;
    const {date, area, status} = match.groups as Record<string, string>;
    return {date: date ?? '', area: area ?? '', status: status ?? ''};
}

/**
 * Render the meta line of an entry.
 *
 * It is a blockquote because markdownlint reads a line that is nothing but
 * emphasis (`_date · area · status_`) as a heading that was written with
 * emphasis instead of with hashes.
 */
export function renderMeta(meta: IMemoryMeta): string {
    return `> _${meta.date} · ${meta.area} · ${meta.status}_`;
}

/** Read a file into a document of raw lines (no trailing empty element). */
export function readDoc(path: string, kind: MemoryKind, scope: string): IMemoryDoc {
    return {path, kind, scope, lines: splitLines(readFileSync(path, 'utf8'))};
}

/** Split file text into lines, dropping the artefact of a trailing newline. */
export function splitLines(text: string): string[] {
    const lines = text.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    return lines;
}

/** Lines inside fenced code blocks, which never hold structure. */
function fenceMap(lines: readonly string[]): boolean[] {
    const map: boolean[] = [];
    let inFence = false;
    for (const line of lines) {
        if (/^\s*(?:```|~~~)/.test(line)) {
            map.push(true);
            inFence = !inFence;
            continue;
        }
        map.push(inFence);
    }
    return map;
}

/** Derive the structure of a document from its lines. */
export function parseDoc(lines: readonly string[]): IMemoryStructure {
    const structure: IMemoryStructure = {title: null, indexRange: null, sections: [], entries: []};

    const titleLine = lines.findIndex(line => /^#\s+\S/.test(line));
    if (titleLine >= 0) structure.title = lines[titleLine]!.replace(/^#\s+/, '').trim();

    const start = lines.findIndex(line => line.trim() === INDEX_START);
    const end =
        start < 0
            ? -1
            : lines.findIndex((line, index) => index > start && line.trim() === INDEX_END);
    if (start >= 0 && end > start) structure.indexRange = [start, end];

    const inIndex = (index: number) =>
        structure.indexRange !== null &&
        index >= structure.indexRange[0] &&
        index <= structure.indexRange[1];

    const fenced = fenceMap(lines);
    const structural = (index: number) => !inIndex(index) && !fenced[index];

    const boundaries: Array<{
        index: number;
        section?: string;
        entry?: {id: string; title: string};
    }> = [];
    lines.forEach((line, index) => {
        if (!structural(index)) return;
        const section = SECTION_HEADING.exec(line);
        if (section?.groups) {
            boundaries.push({index, section: (section.groups['heading'] ?? '').trim()});
            return;
        }
        const entry = ENTRY_HEADING.exec(line);
        if (entry?.groups) {
            boundaries.push({
                index,
                entry: {
                    id: entry.groups['id'] ?? '',
                    title: (entry.groups['title'] ?? '').trim(),
                },
            });
        }
    });

    /** Where the content starting at `from` stops: the next boundary or EOF. */
    const endOf = (from: number): number => {
        const next = boundaries.find(boundary => boundary.index > from);
        const limit = [next?.index ?? lines.length, structure.indexRange?.[0] ?? lines.length]
            .filter(value => value > from)
            .reduce((lowest, value) => Math.min(lowest, value), lines.length);
        let last = limit - 1;
        while (last > from && lines[last]?.trim() === '') last -= 1;
        return last;
    };

    const entryAt = (index: number, section: string): IMemoryEntry => {
        const boundary = boundaries[index]!;
        const entry: IMemoryEntry = {
            id: boundary.entry!.id,
            title: boundary.entry!.title,
            meta: null,
            body: [],
            start: boundary.index,
            end: endOf(boundary.index),
            section,
        };
        const content = lines.slice(entry.start + 1, entry.end + 1);
        let offset = 0;
        while (offset < content.length && content[offset]!.trim() === '') offset += 1;
        const meta = offset < content.length ? parseMeta(content[offset]!) : null;
        if (meta) {
            entry.meta = meta;
            offset += 1;
        }
        const body = content.slice(offset);
        while (body.length > 0 && body[0]!.trim() === '') body.shift();
        while (body.length > 0 && body[body.length - 1]!.trim() === '') body.pop();
        entry.body = body;
        return entry;
    };

    const sectionStarts = boundaries.filter(boundary => boundary.section !== undefined);
    sectionStarts.forEach((boundary, position) => {
        const next = sectionStarts[position + 1];
        const limit = next ? next.index - 1 : lines.length - 1;
        let last = limit;
        while (last > boundary.index && lines[last]?.trim() === '') last -= 1;
        const section: IMemorySection = {
            heading: boundary.section!,
            start: boundary.index,
            end: last,
            entries: [],
            other: [],
        };

        for (const candidate of boundaries) {
            if (candidate.index <= boundary.index || candidate.index > last) continue;
            if (candidate.entry)
                section.entries.push(entryAt(boundaries.indexOf(candidate), section.heading));
        }

        const taken = new Set<number>();
        for (const entry of section.entries) {
            for (let index = entry.start; index <= entry.end; index += 1) taken.add(index);
        }
        for (let index = boundary.index + 1; index <= last; index += 1) {
            if (taken.has(index) || inIndex(index)) continue;
            section.other.push(lines[index]!);
        }

        structure.sections.push(section);
        structure.entries.push(...section.entries);
    });

    return structure;
}

/** Every id mentioned in prose, across a set of documents. */
export function referencedIds(lines: readonly string[]): string[] {
    const found = new Set<string>();
    for (const line of lines) {
        for (const match of line.matchAll(/\b[FTD]-\d{3}\b/g)) found.add(match[0]);
    }
    return Array.from(found);
}
