/**
 * Conversion of a legacy memory file into entries.
 *
 * The three root files were written over months in three different shapes: bold
 * bullet leads (`- **Title.** body`), plain bullets, and prose paragraphs under
 * topic headings (`## Resolved by the "x" pass (2026-09-12):`). This module is
 * the one place that knows those shapes, so the migration is a reviewed command
 * rather than a single hand edit of 3000 lines.
 *
 * Pure: it decides area, date, status, title and body for every entry and reports
 * what it skipped. Writing files is the command's job.
 */

import {manualItem} from './memoryEdit.ts';
import {KIND_STATUSES, MAX_TITLE_LENGTH, type MemoryKind} from './memoryTypes.ts';

const SECTION = /^##\s+(?<heading>\S.*?)\s*$/;
const SUBSECTION = /^###\s+(?<heading>\S.*?)\s*$/;
const BULLET = /^(?<indent> {0,3})-\s+(?<text>.*)$/;
const FENCE = /^\s*(?:```|~~~)/;
const HTML_COMMENT = /^\s*<!--/;
const MANUAL_SECTION = /^manual$/i;
const MANUAL_MARKER = /^-\s*\^\^\s*manual entries are above\s*$/i;
const DATE = /(\d{4}-\d{2}-\d{2})/;

const GROUP_LABEL = /^(?:Resolved by|Fixed by|Verified|Amended|Note|Context|Deferred)\b[^.]*:\s*$/;
const AREA_PATH = /\b((?:core|realm|suite|demo|test|tools|ext)\/[a-z0-9][a-z0-9-]*)\b/;
const AREA_NAME = /\(([a-z][a-z0-9-]+)\s*[,)]/;
const BOLD_LEAD = /^\*\*(?<title>[^*]+?)\*\*\.?\s*(?<rest>[\s\S]*)$/;
/** Legacy topic prefix: `- (semantic-log) **Deferred by ruling: …**`. */
const TOPIC_PREFIX = /^\(([^)]{2,40})\)\s+/;
/** Topic a legacy heading or group label names: `Resolved by the "x" pass (date)`. */
const QUOTED_TOPIC = /["\u201c](?<topic>[^"\u201d]{3,60})["\u201d]/;

/** Status a new entry gets, per kind. */
const DEFAULT_STATUS: Record<MemoryKind, string> = {
    friction: 'open',
    todo: 'open',
    decision: 'active',
};

/** Legacy section headings that already name a status, most specific first. */
const STATUS_BY_HEADING: Array<[RegExp, string]> = [
    [/unresolved/i, 'open'],
    [/\bresolved\b/i, 'resolved'],
    [/\bdone\b/i, 'done'],
    [/\bsuperseded\b/i, 'superseded'],
    [/\bactive\b/i, 'active'],
    [/\bdeferred\b/i, 'open'],
    [/\bopen\b/i, 'open'],
];

export interface IMigrateOptions {
    kind: MemoryKind;
    /** Area for entries that mention no package and sit under no area heading. */
    defaultArea: string;
    /** Date for entries with no dated heading, group label or blame line. */
    defaultDate: string;
    /** 1-based source line numbers to leave out (the reviewed prune list). */
    drop?: ReadonlySet<number>;
    /** Author date per 1-based source line, from git. */
    dates?: ReadonlyMap<number, string>;
    /** Resolve a bare package name from a heading to its project folder. */
    resolvePackage?: (name: string) => string | null;
    /** Validate (and repair) an area; `null` means it is not a known area. */
    resolveArea?: (candidate: string) => string | null;
    /** Resolve a legacy topic prefix such as `(semantic-log)`, or `null`. */
    resolveTopic?: (topic: string) => string | null;
}

export interface IMigratedEntry {
    area: string;
    status: string;
    date: string;
    title: string;
    body: string[];
    /** 1-based line range in the source file. */
    from: number;
    to: number;
    /** Where the area came from, so a dry run can be reviewed. */
    areaSource: 'text' | 'heading' | 'default';
}

export interface IDroppedEntry {
    from: number;
    to: number;
    title: string;
    reason: 'listed';
}

export interface IMigrationResult {
    entries: IMigratedEntry[];
    /** Raw item lines from a `## Manual` section (or the legacy marker block). */
    manual: string[];
    dropped: IDroppedEntry[];
    /** Lines that carried no entry and were not converted (H1, intro, labels). */
    notes: string[];
}

/** Date found in a legacy heading or group label, or `''`. */
function headingDate(heading: string): string {
    return DATE.exec(heading)?.[1] ?? '';
}
/** Area found in a legacy heading: a path, a bare package name, then a topic. */
function headingArea(heading: string, options: IMigrateOptions): string {
    const path = AREA_PATH.exec(heading)?.[1];
    if (path) return path;
    const name = AREA_NAME.exec(heading)?.[1];
    if (name) return options.resolvePackage?.(name) ?? name;
    // A grouped list says only what the group was about (`Resolved by the "wood
    // theme design-match" pass`), and a dated heading says it in prose: either
    // way the topic still names the area for most groups.
    const topic = QUOTED_TOPIC.exec(heading)?.groups?.['topic'];
    if (topic) {
        const resolved = options.resolveTopic?.(topic);
        if (resolved) return resolved;
    }
    return options.resolveTopic?.(heading) ?? '';
}

/** Status implied by a legacy `## ` heading. */
function headingStatus(heading: string): string | null {
    for (const [pattern, status] of STATUS_BY_HEADING) {
        if (pattern.test(heading)) return status;
    }
    return null;
}

/**
 * Keep a heading-implied status only when the kind allows it: a legacy heading
 * that mentions "resolved" says nothing about a decision, which is active or
 * superseded and nothing else.
 */
function kindStatus(status: string | null, kind: MemoryKind): string {
    if (status === null) return DEFAULT_STATUS[kind];
    return KIND_STATUSES[kind].includes(status) ? status : DEFAULT_STATUS[kind];
}

/**
 * Split text into a title and the remainder.
 *
 * A bold lead (`**Title.** rest`) gives both. Legacy bullets often open with a
 * topic label instead (`CI report: …`, `Also worth noting: …`); a label is not a
 * title, so it is dropped and the title comes from what follows. Otherwise the
 * first sentence becomes the title when it fits; when it does not, the title is
 * the text cut at a word boundary and the body keeps everything, so nothing is
 * lost.
 */
export function deriveTitle(text: string): {title: string; body: string} {
    const bold = BOLD_LEAD.exec(text.trim());
    if (bold?.groups) {
        return capTitle(cleanTitle(bold.groups['title'] ?? ''), (bold.groups['rest'] ?? '').trim());
    }

    let flat = text.trim().replace(/\s+/g, ' ');
    for (let guard = 0; guard < 3; guard += 1) {
        const label = /^([^:]{1,40}?):\s+(?=\S)/.exec(flat);
        if (!label) break;
        // A colon inside inline code (`cli: {logLevel}`) is not a label separator.
        if (((label[1] ?? '').match(/`/g)?.length ?? 0) % 2 === 1) break;
        flat = flat.slice(label[0].length);
    }

    const sentence = firstSentence(flat);
    if (sentence.length <= MAX_TITLE_LENGTH) {
        return {title: cleanTitle(sentence), body: flat.slice(sentence.length).trim()};
    }
    return capTitle(flat, '');
}

/**
 * The text up to the end of its first sentence, or the whole text.
 *
 * A `.` only ends a sentence when it is followed by whitespace and a capital (or
 * the end of the text) and is not inside inline code, so dotted identifiers such
 * as `` `knex.retry` `` or `` `config.logLevel` `` do not split the title.
 */
function firstSentence(flat: string): string {
    let ticks = 0;
    for (let index = 0; index < flat.length; index += 1) {
        const char = flat[index];
        if (char === '`') {
            ticks += 1;
            continue;
        }
        if (char !== '.' && char !== '!' && char !== '?') continue;
        if (ticks % 2 === 1) continue;
        const next = flat[index + 1] ?? '';
        const after = flat[index + 2] ?? '';
        if (next === '') return flat.slice(0, index + 1);
        if (/\s/.test(next) && (after === '' || /[A-Z(“"(`[]/.test(after))) {
            return flat.slice(0, index + 1);
        }
    }
    return flat;
}

/**
 * One line, no trailing punctuation: a legacy bold lead can span several source
 * lines, and a title with a `\n` in it would split the entry heading in two.
 */
function cleanTitle(title: string): string {
    return title
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[.:;]$/, '');
}

/**
 * Keep a title within `MAX_TITLE_LENGTH`, cutting at a word boundary (and never
 * leaving an inline-code span open); the remainder moves into the body so no text
 * is lost.
 */
function capTitle(title: string, rest: string): {title: string; body: string} {
    if (title.length <= MAX_TITLE_LENGTH) return {title, body: rest};
    const cut = title.slice(0, MAX_TITLE_LENGTH);
    const at = cut.lastIndexOf(' ');
    let head = (at > 40 ? cut.slice(0, at) : cut).trim();
    const ticks = head.match(/`/g)?.length ?? 0;
    if (ticks % 2 === 1) {
        const lastTick = head.lastIndexOf('`');
        if (lastTick > 0) head = head.slice(0, lastTick).trim();
    }
    const tail = title.slice(head.length).trim();
    const body = tail === '' ? rest : rest === '' ? tail : `${tail}\n\n${rest}`;
    return {title: cleanTitle(head), body};
}

/** True when the line introduces a group of entries rather than being one. */
function isGroupLabel(line: string): boolean {
    return GROUP_LABEL.test(line.trim());
}

/**
 * Convert one legacy file.
 *
 * The walker keeps the current section (for status, area and date), the current
 * group label (a `### ` heading or a `Resolved by …:` line, for date and
 * context) and consumes each bullet or paragraph as one entry.
 */
export function migrateLegacy(
    lines: readonly string[],
    options: IMigrateOptions,
): IMigrationResult {
    const result: IMigrationResult = {entries: [], manual: [], dropped: [], notes: []};
    const fenced: boolean[] = [];
    let inFence = false;
    lines.forEach(line => {
        if (FENCE.test(line)) {
            fenced.push(true);
            inFence = !inFence;
            return;
        }
        fenced.push(inFence);
    });

    let status = DEFAULT_STATUS[options.kind];
    let sectionArea = '';
    let sectionDate = '';
    let groupArea = '';
    let groupDate = '';
    let manual = false;
    let seenSection = false;

    // The legacy todo list delimited the user's own items with a marker line;
    // everything above it is theirs and stays a manual item.
    const marker = lines.findIndex(line => MANUAL_MARKER.test(line));
    const isManual = (index: number) => manual || (marker >= 0 && index < marker);

    /** Consume the lines belonging to the block that starts at `start`. */
    const consume = (
        start: number,
        isContinuation: (line: string, blankBefore: boolean) => boolean,
    ): number => {
        let end = start;
        let index = start + 1;
        while (index < lines.length) {
            const line = lines[index] ?? '';
            if (fenced[index]) {
                end = index;
                index += 1;
                continue;
            }
            if (line.trim() === '') {
                const next = lines[index + 1] ?? '';
                const nextIndented = /^\s{2,}\S/.test(next) || FENCE.test(next);
                if (isContinuation('', true) && nextIndented) {
                    end = index;
                    index += 1;
                    continue;
                }
                break;
            }
            if (!isContinuation(line, false)) break;
            end = index;
            index += 1;
        }
        return end;
    };

    /**
     * Register one entry, honouring the drop list.
     *
     * A legacy bullet may open with a topic in brackets (`- (docs) …`), which is
     * a label rather than a title: it is stripped, and used as an area hint when
     * it names a package or one of the reserved areas.
     */
    const add = (from: number, to: number, text: string): void => {
        const topicPrefix = TOPIC_PREFIX.exec(text.trim());
        const topic = topicPrefix?.[1]?.trim() ?? '';
        const rest = topicPrefix ? text.trim().slice(topicPrefix[0].length) : text;
        const {title, body} = deriveTitle(rest);
        if (title === '') return;
        const droppedLines = Array.from({length: to - from + 1}, (_, offset) => from + offset);
        if (options.drop && droppedLines.some(line => options.drop?.has(line))) {
            result.dropped.push({from, to, title, reason: 'listed'});
            return;
        }
        const topicArea = topic === '' ? '' : (options.resolveTopic?.(topic) ?? '');
        const fromText = AREA_PATH.exec(rest)?.[1] ?? '';
        const fromHeading = groupArea !== '' ? groupArea : sectionArea;
        const candidate = topicArea !== '' ? topicArea : fromText !== '' ? fromText : fromHeading;
        const areaSource: IMigratedEntry['areaSource'] =
            topicArea !== '' || fromText !== ''
                ? 'text'
                : fromHeading !== ''
                  ? 'heading'
                  : 'default';
        let area = candidate !== '' ? candidate : options.defaultArea;
        const resolved = options.resolveArea ? options.resolveArea(area) : area;
        if (resolved === null) {
            result.notes.push(
                `unknown area "${area}" on line ${from} — used ${options.defaultArea}`,
            );
            area = options.defaultArea;
        } else {
            area = resolved;
        }
        const date =
            headingDate(rest) ||
            groupDate ||
            sectionDate ||
            options.dates?.get(from) ||
            options.defaultDate;
        result.entries.push({
            area,
            status,
            date,
            title,
            body: body === '' ? [] : body.split('\n'),
            from,
            to,
            areaSource,
        });
    };

    let index = 0;
    while (index < lines.length) {
        const line = lines[index] ?? '';

        if (fenced[index]) {
            index += 1;
            continue;
        }
        if (line.trim() === '') {
            index += 1;
            continue;
        }
        if (HTML_COMMENT.test(line)) {
            result.notes.push(`skipped comment on line ${index + 1}`);
            index += 1;
            continue;
        }
        if (/^#\s/.test(line)) {
            result.notes.push(`skipped title on line ${index + 1}: ${line.replace(/^#\s*/, '')}`);
            index += 1;
            continue;
        }

        const section = SECTION.exec(line);
        if (section?.groups) {
            const heading = section.groups['heading'] ?? '';
            seenSection = true;
            status = kindStatus(headingStatus(heading), options.kind);
            sectionArea = headingArea(heading, options);
            sectionDate = headingDate(heading);
            groupArea = '';
            groupDate = '';
            manual = MANUAL_SECTION.test(heading);
            index += 1;
            continue;
        }

        const subsection = SUBSECTION.exec(line);
        if (subsection?.groups) {
            const heading = subsection.groups['heading'] ?? '';
            groupArea = headingArea(heading, options);
            groupDate = headingDate(heading);
            result.notes.push(`group on line ${index + 1}: ${heading}`);
            index += 1;
            continue;
        }

        if (MANUAL_MARKER.test(line)) {
            result.notes.push(`manual marker on line ${index + 1}`);
            manual = false;
            index += 1;
            continue;
        }

        if (isGroupLabel(line)) {
            const heading = line.trim().replace(/:$/, '');
            groupDate = headingDate(heading);
            groupArea = headingArea(heading, options);
            result.notes.push(`group label on line ${index + 1}: ${heading}`);
            index += 1;
            continue;
        }

        const bullet = BULLET.exec(line);
        if (!seenSection) {
            // The preamble (the H1's paragraph) describes the file, not an entry.
            result.notes.push(`skipped preamble on line ${index + 1}`);
            index += 1;
            continue;
        }
        if (bullet?.groups) {
            const end = consume(index, (candidate, blank) => {
                if (blank) return true;
                if (FENCE.test(candidate)) return true;
                return /^\s{2,}\S/.test(candidate);
            });
            const parts = [bullet.groups['text'] ?? ''];
            for (let line_ = index + 1; line_ <= end; line_ += 1) {
                const raw = lines[line_] ?? '';
                if (raw.trim() === '') {
                    parts.push('');
                    continue;
                }
                parts.push(fenced[line_] ? raw : raw.replace(/^\s{2}/, ''));
            }
            const text = parts.join('\n').trimEnd();
            if (isManual(index)) {
                result.manual.push(manualItem(text));
            } else {
                add(index + 1, end + 1, text);
            }
            index = end + 1;
            continue;
        }

        // A paragraph: consecutive lines that are not blank and not a boundary.
        const end = consume(index, (candidate, blank) => {
            if (blank) return false;
            if (FENCE.test(candidate)) return true;
            if (/^#{1,6}\s/.test(candidate)) return false;
            if (BULLET.test(candidate)) return false;
            if (isGroupLabel(candidate)) return false;
            if (HTML_COMMENT.test(candidate)) return false;
            return true;
        });
        const text = lines
            .slice(index, end + 1)
            .join('\n')
            .trim();
        if (isManual(index)) {
            result.manual.push(manualItem(text));
        } else {
            add(index + 1, end + 1, text);
        }
        index = end + 1;
    }

    return result;
}

/** Read a drop list: one entry per line, as `N` or `N-M` (1-based source lines). */
export function parseDropList(text: string): Set<number> {
    const dropped = new Set<number>();
    for (const raw of text.split('\n')) {
        const line = raw.replace(/#.*$/, '').trim();
        if (line === '') continue;
        const range = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(line);
        if (!range) continue;
        const from = Number(range[1]);
        const to = range[2] ? Number(range[2]) : from;
        for (let line_ = from; line_ <= to; line_ += 1) dropped.add(line_);
    }
    return dropped;
}

/**
 * Author date per 1-based line, from `git blame --line-porcelain`.
 *
 * Legacy entries carry no date of their own, and stamping them all with the
 * migration date would lose the history the audit depends on.
 */
export function parseBlameDates(text: string): Map<number, string> {
    const dates = new Map<number, string>();
    let pending = 0;
    let date = '';
    for (const raw of text.split('\n')) {
        const time = /^author-time (\d+)$/.exec(raw);
        if (time) {
            date = new Date(Number(time[1]) * 1000).toISOString().slice(0, 10);
            continue;
        }
        const header = /^\S+ \d+ (\d+)(?: \d+)?$/.exec(raw);
        if (header) {
            pending = Number(header[1]);
            continue;
        }
        if (raw.startsWith('\t') && pending > 0) {
            dates.set(pending, date);
            pending = 0;
        }
    }
    return dates;
}

/** All dates mentioned in a text, for the dry-run report. */
export function datesIn(text: string): string[] {
    return Array.from(text.matchAll(/\d{4}-\d{2}-\d{2}/g), match => match[0]);
}
