/**
 * The cross-reference vocabulary of the repository: the `@@` tokens the code, the
 * docs and the skills write, the three corpora they can name, and the answer to
 * "does this reference still resolve?".
 *
 * One grammar covers the memory entries (`@@F-014`), the documentation pages and
 * their sections (`@@doc:patterns/memory#anchor`) and the agent skills and theirs
 * (`@@skill:blong-realm#layers`), so a single resolver backs the `refs` linter, the
 * `export` index and the editor's hover. A markdown file points at a page or a skill
 * with a normal relative link instead of the token — the editor already follows it,
 * and the anchor is checked the same way.
 *
 * Everything here is derived: the markdown is the source of truth and the catalogue
 * is rebuilt from it on each run, so an edit is picked up with no invalidation.
 */

import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, statSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';

import type {IPageSource} from './hindsight/hindsightPage.ts';
import {discoverPages} from './hindsight/hindsightSources.ts';
import {parseDoc, readDoc} from './memoryParse.ts';
import {listMemoryFiles} from './memoryPaths.ts';
import {KIND_BY_PREFIX, REFERENCE, RETIRED_SECTION, type MemoryKind} from './memoryTypes.ts';

/** What a reference token names. */
export type ReferenceTarget =
    | {kind: 'entry'; id: string}
    | {kind: 'doc'; page: string; anchor?: string}
    | {kind: 'skill'; name: string; anchor?: string};

/** One reference token found in a file. */
export interface IReferenceToken {
    /** The whole token, e.g. `@@doc:patterns/memory#searching-by-meaning`. */
    raw: string;
    /** 1-based line the token sits on. */
    line: number;
    /** 0-based column the token starts at. */
    column: number;
    target: ReferenceTarget;
}

/** How a reference resolved. */
export type ReferenceCode =
    /** The target exists, and an entry id is held by exactly one file. */
    | 'ok'
    /** A memory id that once existed and was closed or pruned; the ledger names its fate. */
    | 'retired'
    /** A decision another entry replaced; it names the successor when its body records one. */
    | 'superseded'
    /** A memory id two files hold. */
    | 'ambiguous'
    /** No such id, page, skill, or anchor. */
    | 'unknown';

/** The outcome of resolving one token. */
export interface IReferenceResolution {
    code: ReferenceCode;
    /** The line the token sits on, and the file it was written in — filled by the caller. */
    message: string;
    /** Repository-relative file the target lives in, when it exists. */
    file?: string;
    /** 1-based line of the target within that file. */
    line?: number;
    /** The entry or page title, for a hover or a report. */
    title?: string;
    /** The entry's status, when the target is an entry. */
    status?: string;
    /** The successor an id was retired in favour of. */
    successor?: string;
}

/** An entry, as the reference index describes it. */
export interface IReferenceEntry {
    id: string;
    kind: MemoryKind;
    scope: string;
    area: string;
    status: string;
    date: string;
    title: string;
    body: string;
    /** The successor the body names, when a superseded entry says `Superseded by \`D-042\``. */
    successor?: string;
    /** Repository-relative. */
    file: string;
    /** 1-based line of the entry heading. */
    line: number;
}

/** A documentation page or a skill, with the anchors its sections answer to. */
export interface IReferencePage {
    /** `patterns/memory` for a page, the skill name for a skill. */
    key: string;
    kind: 'doc' | 'skill';
    title: string;
    /** Repository-relative. */
    file: string;
    tier?: string;
    /** Heading slug → 1-based line. */
    anchors: Record<string, number>;
}

/** A closed or pruned id, as the `## Retired` ledger records it. */
export interface IReferenceLedger {
    id: string;
    /** The sentence after the em dash, e.g. `superseded by D-042 (2026-08-01)`. */
    fate: string;
    file: string;
    line: number;
    successor?: string;
}

/** Everything a reference can name, derived from the tree. */
export interface IReferenceIndex {
    /** id → the entries that hold it (one file, or several when they collide). */
    entries: Map<string, IReferenceEntry[]>;
    docs: Map<string, IReferencePage>;
    skills: Map<string, IReferencePage>;
    ledger: Map<string, IReferenceLedger>;
}

/** A file plus its lines, for the scan. */
export interface IScannedFile {
    /** Repository-relative, `/`-separated. */
    file: string;
    lines: string[];
}

/** Extension allowlist for the scan — the files prose is written in. */
export const SCAN_EXTENSIONS: readonly string[] = [
    'ts',
    'tsx',
    'js',
    'jsx',
    'mjs',
    'cjs',
    'json',
    'yaml',
    'yml',
    'md',
    'sh',
    'feature',
];

/** The `## Retired` heading, as a section of a memory file. */
export const RETIRED_HEADING = 'Retired';

/**
 * The slug a heading answers to — GitHub's rule: lowercase, spaces to `-`, and
 * everything that is not a letter, a digit, `-` or `_` dropped. The linter and the
 * editor derive the same slug, so an anchor that no longer matches a heading is an
 * error rather than a silent miss.
 */
export function slugOf(heading: string): string {
    return heading
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\-_ ]/gu, '')
        .replace(/ /g, '-');
}

/** The H1 and the heading anchors of a markdown document. */
function headingsOf(lines: readonly string[]): {
    title: string | null;
    anchors: Record<string, number>;
} {
    let title: string | null = null;
    const anchors: Record<string, number> = {};
    let inFence = false;
    lines.forEach((line, index) => {
        if (/^\s*(?:```|~~~)/.test(line)) {
            inFence = !inFence;
            return;
        }
        if (inFence) return;
        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        if (!heading) return;
        const text = heading[2]!.trim();
        if (heading[1]!.length === 1 && title === null) title = text;
        else anchors[slugOf(text)] = index + 1;
    });
    return {title, anchors};
}

/** The reference target a regex match describes. */
function targetOf(match: RegExpExecArray): ReferenceTarget | null {
    const groups = match.groups;
    if (!groups) return null;
    const {id, docTier, docName, docAnchor, skillName, skillAnchor} = groups;
    if (id) return {kind: 'entry', id: id.toUpperCase()};
    if (docTier && docName) {
        return {
            kind: 'doc',
            page: `${docTier}/${docName}`,
            ...(docAnchor ? {anchor: docAnchor} : {}),
        };
    }
    if (skillName) {
        return {kind: 'skill', name: skillName, ...(skillAnchor ? {anchor: skillAnchor} : {})};
    }
    return null;
}

/** Every reference token on one line, with no code-formatting filtering. */
export function parseLineReferences(line: string, lineNumber: number): IReferenceToken[] {
    const found: IReferenceToken[] = [];
    REFERENCE.lastIndex = 0;
    for (const match of line.matchAll(REFERENCE)) {
        const target = targetOf(match as RegExpExecArray);
        if (target) {
            found.push({raw: match[0], line: lineNumber, column: match.index ?? 0, target});
        }
    }
    return found;
}

/** The number of backticks before a column, to tell an example from a reference. */
function backticksBefore(line: string, column: number): number {
    return (line.slice(0, column).match(/`/g) ?? []).length;
}

/**
 * Every reference token in a document.
 *
 * A token that sits inside code formatting — a fenced block, or an inline code span
 * (`@@F-014`) — is an example of the syntax, not a reference, so it is skipped.
 * This is what lets the docs, the skills and the plans *explain* the token without
 * tripping the linter that checks its uses.
 */
export function parseReferences(lines: readonly string[]): IReferenceToken[] {
    const found: IReferenceToken[] = [];
    let inFence = false;
    lines.forEach((line, index) => {
        if (/^\s*(?:```|~~~)/.test(line)) {
            inFence = !inFence;
            return;
        }
        if (inFence) return;
        for (const token of parseLineReferences(line, index + 1)) {
            if (backticksBefore(line, token.column) % 2 === 1) continue;
            found.push(token);
        }
    });
    return found;
}

/** The page key of a documentation page: `<tier>/<name>` without the extension. */
export function docKeyOf(page: IPageSource): string {
    return page.relativePath.replace(/\.md$/, '');
}

/** The skill name of a skill page: the folder above `SKILL.md`. */
export function skillKeyOf(page: IPageSource): string {
    return page.relativePath.split('/')[0] ?? page.relativePath;
}

/** Build the catalogue of everything a reference can name, from the tree. */
export function buildReferenceIndex(root: string): IReferenceIndex {
    const entries = new Map<string, IReferenceEntry[]>();
    const ledger = new Map<string, IReferenceLedger>();

    for (const file of listMemoryFiles(root)) {
        const doc = readDoc(file.path, file.kind, file.scope);
        const structure = parseDoc(doc.lines);
        const rel = relative(root, file.path).split('\\').join('/');
        for (const entry of structure.entries) {
            const body = entry.body.join('\n');
            const successor = successorOf(body);
            const holder: IReferenceEntry = {
                id: entry.id,
                kind: doc.kind,
                scope: doc.scope,
                area: entry.meta?.area ?? '?',
                status: entry.meta?.status ?? '?',
                date: entry.meta?.date ?? '?',
                title: entry.title,
                body,
                ...(successor ? {successor} : {}),
                file: rel,
                line: entry.start + 1,
            };
            entries.set(entry.id, [...(entries.get(entry.id) ?? []), holder]);
        }
        for (const record of retiredLines(doc.lines)) {
            const parsed = parseRetiredLine(record.text, rel, record.line);
            if (parsed) ledger.set(parsed.id, parsed);
        }
    }

    const docs = new Map<string, IReferencePage>();
    const skills = new Map<string, IReferencePage>();
    for (const page of discoverPages(root, ['docs', 'skill'])) {
        const lines = splitLines(readFileSync(page.path, 'utf8'));
        const {title, anchors} = headingsOf(lines);
        const key = page.kind === 'docs' ? docKeyOf(page) : skillKeyOf(page);
        const record: IReferencePage = {
            key,
            kind: page.kind === 'docs' ? 'doc' : 'skill',
            title: title ?? key,
            file: relative(root, page.path).split('\\').join('/'),
            ...(page.tier ? {tier: page.tier} : {}),
            anchors,
        };
        (page.kind === 'docs' ? docs : skills).set(key, record);
    }

    return {entries, docs, skills, ledger};
}

/** Split text into lines, dropping the artefact of a trailing newline. */
function splitLines(text: string): string[] {
    const lines = text.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    return lines;
}

/** Lines inside a `## Retired` section that start with a ledger bullet. */
function retiredLines(lines: readonly string[]): Array<{text: string; line: number}> {
    const structure = parseDoc(lines);
    const section = structure.sections.find(candidate => candidate.heading === RETIRED_SECTION);
    if (!section) return [];
    const found: Array<{text: string; line: number}> = [];
    for (let line = section.start + 1; line <= section.end; line += 1) {
        const text = lines[line];
        if (text !== undefined && /^-\s*[FTD]-\d{3}\b/.test(text.trim())) {
            found.push({text: text.trim(), line: line + 1});
        }
    }
    return found;
}

/** `- F-101 — superseded by F-090 (2026-08-01)` → a ledger record. */
function parseRetiredLine(line: string, file: string, lineNumber: number): IReferenceLedger | null {
    const match = /^-\s*(?<id>[FTD]-\d{3})\s*—\s*(?<fate>.+)$/.exec(line);
    if (!match?.groups) return null;
    const id = match.groups['id']!;
    const fate = match.groups['fate']!.trim();
    const successor = /\b(?<id>[FTD]-\d{3})\b/.exec(fate)?.groups?.['id'];
    return {id, fate, file, line: lineNumber, ...(successor ? {successor} : {})};
}

/**
 * Resolve one token against the catalogue.
 *
 * The codes are ordered by severity (see the plan): a retired id and a superseded decision are
 * warnings — history that names what replaced it, which a reader can retarget — while an unknown id,
 * an ambiguous one and a missing anchor are errors, because they are mistakes.
 */
export function resolveReference(
    target: ReferenceTarget,
    index: IReferenceIndex,
): IReferenceResolution {
    if (target.kind === 'entry') {
        const holders = index.entries.get(target.id) ?? [];
        if (holders.length > 1) {
            return {
                code: 'ambiguous',
                message: `${target.id} is held by ${holders.length} files — ${holders
                    .map(holder => holder.file)
                    .join(', ')}`,
            };
        }
        const holder = holders[0];
        if (holder) {
            // A decision that another entry replaced must not be cited as live reasoning: the
            // comment follows the successor when the entry names one, and is worth a look when it
            // does not. A resolved friction or a done todo is the record of the workaround the code
            // embodies, so those stay citations and resolve as `ok`.
            if (holder.status === 'superseded') {
                return {
                    code: 'superseded',
                    message: holder.successor
                        ? `${target.id} is superseded — the reasoning moved to ${holder.successor}`
                        : `${target.id} is superseded and names no successor`,
                    file: holder.file,
                    line: holder.line,
                    title: holder.title,
                    status: holder.status,
                    ...(holder.successor ? {successor: holder.successor} : {}),
                };
            }
            return {
                code: 'ok',
                message: `${target.id} — ${holder.title}`,
                file: holder.file,
                line: holder.line,
                title: holder.title,
                status: holder.status,
            };
        }
        const retired = index.ledger.get(target.id);
        if (retired) {
            return {
                code: 'retired',
                message: `${target.id} is retired — ${retired.fate}`,
                file: retired.file,
                ...(retired.successor ? {successor: retired.successor} : {}),
            };
        }
        return {code: 'unknown', message: `no entry with id ${target.id}`};
    }

    const table = target.kind === 'doc' ? index.docs : index.skills;
    const key = target.kind === 'doc' ? target.page : target.name;
    const page = table.get(key);
    if (!page) {
        const noun = target.kind === 'doc' ? 'documentation page' : 'skill';
        return {code: 'unknown', message: `no ${noun} "${key}"`};
    }
    const anchor = target.anchor;
    if (anchor && !(anchor in page.anchors)) {
        const noun = target.kind === 'doc' ? 'page' : 'skill';
        return {
            code: 'unknown',
            message: `${noun} "${key}" has no section "#${anchor}"`,
            file: page.file,
            title: page.title,
        };
    }
    return {
        code: 'ok',
        message: `${page.title}${anchor ? ` #${anchor}` : ''}`,
        file: page.file,
        ...(anchor ? {line: page.anchors[anchor]} : {}),
        title: page.title,
    };
}

/** Every tracked file the scan reads, honouring `.gitignore` through `git ls-files`. */
export function trackedFiles(
    root: string,
    extensions: readonly string[] = SCAN_EXTENSIONS,
): string[] {
    const allowed = new Set(extensions);
    let listed: string[];
    try {
        listed = execFileSync('git', ['ls-files', '-z'], {cwd: root})
            .toString('utf8')
            .split('\0')
            .filter(Boolean);
    } catch {
        return [];
    }
    return listed
        .filter(file => allowed.has(file.split('.').pop() ?? ''))
        .filter(file => existsSync(join(root, file)));
}

/** Read the tracked files as lines, for a scan. */
export function readScannedFiles(root: string, files: readonly string[]): IScannedFile[] {
    return files
        .filter(file => {
            try {
                return statSync(join(root, file)).isFile();
            } catch {
                return false;
            }
        })
        .map(file => ({
            file,
            lines: splitLines(readFileSync(join(root, file), 'utf8')),
        }));
}

/** A token found in a file, with the file and line it was written on. */
export interface IReferenceSite {
    file: string;
    line: number;
    column: number;
    raw: string;
    /** The line the token sits on, trimmed — what an audit reads it in. */
    text: string;
    target: ReferenceTarget;
    resolution: IReferenceResolution;
}

/** Every `@@` reference in the given files, resolved. */
export function referenceSites(
    root: string,
    files: readonly string[],
    index: IReferenceIndex = buildReferenceIndex(root),
): IReferenceSite[] {
    return scanSites(root, files, index).references;
}

/** Both reference kinds a scan finds, in one pass over the files. */
export function scanSites(
    root: string,
    files: readonly string[],
    index: IReferenceIndex = buildReferenceIndex(root),
): {references: IReferenceSite[]; links: ILinkSite[]} {
    const references: IReferenceSite[] = [];
    const links: ILinkSite[] = [];
    for (const scanned of readScannedFiles(root, files)) {
        // A file may opt out — a fixture that carries a deliberately broken example.
        if (scanned.lines.slice(0, 8).some(line => /memory-refs:\s*ignore/.test(line))) continue;
        for (const token of parseReferences(scanned.lines)) {
            references.push({
                file: scanned.file,
                line: token.line,
                column: token.column,
                raw: token.raw,
                text: (scanned.lines[token.line - 1] ?? '').trim(),
                target: token.target,
                resolution: resolveReference(token.target, index),
            });
        }
        if (scanned.file.endsWith('.md')) {
            links.push(...markdownLinkSites(root, scanned.file, scanned.lines));
        }
    }
    return {references, links};
}

/**
 * The markdown links a file makes to a page or a skill, resolved.
 *
 * A markdown file names a page with a link, not with `@@doc:` — so the linter has to
 * read the links too, or the references the docs and the skills actually use would go
 * unchecked. Only relative links that end in `.md` (and so point at a markdown
 * document) are considered; a URL, an image or an anchor-only link is left alone.
 */
export interface ILinkSite {
    file: string;
    line: number;
    column: number;
    raw: string;
    target: string;
    anchor?: string;
    /** Why a link did not resolve — a fix may address an anchor, never a missing file. */
    reason?: 'file' | 'anchor';
    code: ReferenceCode;
    message: string;
}

const MARKDOWN_LINK = /\]\((?<href>[^)\s]+)\)/g;

/** Resolve the relative markdown links in one file against the tree. */
export function markdownLinkSites(
    root: string,
    file: string,
    lines: readonly string[],
): ILinkSite[] {
    const base = dirname(join(root, file));
    const found: ILinkSite[] = [];
    let inFence = false;
    lines.forEach((line, index) => {
        if (/^\s*(?:```|~~~)/.test(line)) {
            inFence = !inFence;
            return;
        }
        // A link inside a fence or an inline code span is an example, not a reference.
        if (inFence) return;
        MARKDOWN_LINK.lastIndex = 0;
        for (const match of line.matchAll(MARKDOWN_LINK)) {
            const href = match.groups?.['href'];
            if (!href || /^[a-z]+:/i.test(href) || href.startsWith('#') || href.startsWith('/')) {
                continue;
            }
            if (backticksBefore(line, match.index ?? 0) % 2 === 1) continue;
            const [path, anchor] = href.split('#');
            if (!path || !path.endsWith('.md')) continue;
            const absolute = resolve(base, path);
            const rel = relative(root, absolute).split('\\').join('/');
            const site: ILinkSite = {
                file,
                line: index + 1,
                // The match starts at the `]`; the token a rewrite replaces starts at the href.
                column: (match.index ?? 0) + 2,
                raw: href,
                target: rel,
                ...(anchor ? {anchor} : {}),
                code: 'ok',
                message: rel,
            };
            if (!existsSync(absolute)) {
                site.code = 'unknown';
                site.reason = 'file';
                site.message = `no file ${rel}`;
            } else if (anchor) {
                const {anchors} = headingsOf(splitLines(readFileSync(absolute, 'utf8')));
                if (!(anchor in anchors)) {
                    site.code = 'unknown';
                    site.reason = 'anchor';
                    site.message = `${rel} has no section "#${anchor}"`;
                } else {
                    site.line = anchors[anchor]!;
                    site.message = `${rel} #${anchor}`;
                }
            }
            found.push(site);
        }
    });
    return found;
}

/** True when the id's prefix names a memory kind. */
export function isMemoryId(id: string): boolean {
    return KIND_BY_PREFIX[id.slice(0, 1)?.toUpperCase() ?? ''] !== undefined;
}

/**
 * The id a superseded entry names as its successor, from `close --by`'s own paragraph.
 *
 * The paragraph is the entry's record of where its reasoning went, so a citation of it can be
 * retargeted without reading anything else. An entry closed with a reason instead has none, which is
 * why the caller has to handle its absence rather than assume a successor.
 */
export function successorOf(body: string): string | undefined {
    return /superseded by `?([FTD]-\d{3})`?/i.exec(body)?.[1];
}

/** Levenshtein distance, for telling a renamed anchor from an unrelated one. */
function editDistance(a: string, b: string): number {
    const cols = b.length + 1;
    let previous = Array.from({length: cols}, (_, j) => j);
    for (let i = 1; i <= a.length; i += 1) {
        const current = [i];
        for (let j = 1; j < cols; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            current[j] = Math.min(
                (previous[j] ?? 0) + 1,
                (current[j - 1] ?? 0) + 1,
                (previous[j - 1] ?? 0) + cost,
            );
        }
        previous = current;
    }
    return previous[cols - 1] ?? 0;
}

/**
 * The one heading an anchor means to name, when a heading moved and exactly one moved to it.
 *
 * An anchor that names no heading is usually a heading that was renamed, and the rename is not
 * guessable from the slug — so only a candidate close enough to it (and alone at that distance)
 * is offered. `undefined` means the token is reported rather than rewritten.
 */
export function nearestAnchor(anchors: Record<string, number>, anchor: string): string | undefined {
    const candidates = Object.keys(anchors).filter(slug => editDistance(slug, anchor) <= 2);
    return candidates.length === 1 ? candidates[0] : undefined;
}
