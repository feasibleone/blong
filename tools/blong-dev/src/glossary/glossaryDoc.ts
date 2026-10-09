/**
 * The glossary, read and rewritten by `blong-dev glossary`.
 *
 * The glossary is the repository's vocabulary: `docs/blong/docs/concepts/glossary.md` names the
 * word, gives it a one-sentence meaning, and points at the page that explains it in full. The
 * definitions are meant to stay short — the file is a map, not the territory — so the two things a
 * hand edit gets wrong are the ordering and the drift of a definition into a paragraph. The command
 * owns the ordering and the length, the same way `blong-dev cspell` owns the dictionary's insertion
 * point, and leaves the intro, the markers and the surrounding file alone.
 *
 * The managed region is delimited by {@link GLOSSARY_START} / {@link GLOSSARY_END}, so the intro can
 * change without the parser guessing where the entries stop. Each entry is one paragraph, opened by
 * a bold term, an em dash, and the definition. The em dash is the same character the prose
 * convention asks for, so an entry reads as a sentence rather than as a table row.
 */

import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';

import {wrapText} from '../memory/memoryFormat.ts';

/** Repository-relative path of the file the command maintains. */
export const GLOSSARY_FILE = 'docs/blong/docs/concepts/glossary.md';

/** Marker that opens the region the command owns. */
export const GLOSSARY_START = '<!-- BEGIN GLOSSARY -->';

/** Marker that closes the region the command owns. */
export const GLOSSARY_END = '<!-- END GLOSSARY -->';

/** What separates a term from its definition: an em dash, spaced. */
export const GLOSSARY_SEPARATOR = ' — ';

/**
 * A definition longer than this many words is not a definition any more.
 *
 * The limit exists so the glossary stays easy to scan: an entry that needs a paragraph belongs in
 * the page it links to, not here. Forty words fits a sentence with two links, and rejects the drift
 * that turns the file into a second copy of the documentation.
 */
export const MAX_DEFINITION_WORDS = 40;

/** One paragraph inside the region: `**term** — definition`. */
const ENTRY = /^\*\*(?<term>[^*]+)\*\* — (?<definition>.+)$/;

/** A term an `add` accepts: words of letters and digits, joined by single spaces or hyphens. */
const TERM = /^[a-z][a-z0-9]*(?:[ -][a-z0-9]+)*$/i;

/** A markdown link target, with an optional title. */
const LINK = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** A URL scheme (`http:`, `https:`, `mailto:`), which marks a link as external. */
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** One glossary entry. */
export interface IGlossaryEntry {
    /** The headword, as written (`adapter`, `RBAC`, `handler-test continuum`). */
    term: string;
    /** The one-sentence definition, with markdown links. */
    definition: string;
}

/** The parsed glossary, split into the parts a rewrite must keep and the entries it owns. */
export interface IGlossaryDoc {
    /** Lines before {@link GLOSSARY_START}; the intro. */
    prefix: string[];
    /** Lines after {@link GLOSSARY_END}. */
    suffix: string[];
    /** The entries, in file order. */
    entries: IGlossaryEntry[];
    /** Paragraphs inside the region that are not entries, so a rewrite can refuse to drop them. */
    malformed: string[];
    /** Whether the marker pair was present. */
    marked: boolean;
}

/** A problem `check` reports, naming the entry it belongs to when there is one. */
export interface IGlossaryProblem {
    term?: string;
    message: string;
}

/** The key two terms are compared and de-duplicated by: trimmed and case-insensitive. */
export function normalizeTerm(term: string): string {
    return term.trim().toLowerCase();
}

/**
 * Order two terms the way the file orders them.
 *
 * Case-insensitively, by code unit, like the cspell list: `API definition` sorts under `a`, and two
 * terms that differ only in case compare equal so a stable sort leaves them where they were.
 */
export function compareTerms(left: string, right: string): number {
    const a = left.toLowerCase();
    const b = right.toLowerCase();
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
}

/** Whether `term` is a word an entry can be keyed by. */
export function isTerm(term: string): boolean {
    return TERM.test(term);
}

/** Split the region into paragraphs and read each as an entry, remembering the ones that are not. */
function parseRegion(region: string): {entries: IGlossaryEntry[]; malformed: string[]} {
    const entries: IGlossaryEntry[] = [];
    const malformed: string[] = [];
    for (const raw of region.split(/\n\s*\n/)) {
        const logical = raw
            .split('\n')
            .map(line => line.trim())
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (logical === '') continue;
        const match = ENTRY.exec(logical);
        if (match?.groups) {
            entries.push({term: match.groups['term']!.trim(), definition: match.groups.definition!.trim()});
        } else {
            malformed.push(logical);
        }
    }
    return {entries, malformed};
}

/** Parse the glossary's text. */
export function parseGlossary(text: string): IGlossaryDoc {
    const lines = text.split('\n');
    const start = lines.findIndex(line => line.trim() === GLOSSARY_START);
    const end = lines.findIndex(line => line.trim() === GLOSSARY_END);
    const marked = start !== -1 && end !== -1 && end > start;
    if (!marked) {
        return {prefix: lines, suffix: [], entries: [], malformed: [], marked: false};
    }
    const {entries, malformed} = parseRegion(lines.slice(start + 1, end).join('\n'));
    return {prefix: lines.slice(0, start), suffix: lines.slice(end + 1), entries, malformed, marked: true};
}

/** Read the glossary from disk. */
export function loadGlossary(file: string): IGlossaryDoc {
    return parseGlossary(readFileSync(file, 'utf8'));
}

/** Drop trailing blank lines, so a render does not grow a blank run on every rewrite. */
function dropTrailingBlank(lines: string[]): string[] {
    const copy = [...lines];
    while (copy.length > 0 && copy[copy.length - 1]!.trim() === '') copy.pop();
    return copy;
}

/** Drop leading blank lines. */
function dropLeadingBlank(lines: string[]): string[] {
    let index = 0;
    while (index < lines.length && lines[index]!.trim() === '') index++;
    return lines.slice(index);
}

/** One entry as a single logical line. */
export function renderTerm(entry: IGlossaryEntry): string {
    return `**${entry.term}**${GLOSSARY_SEPARATOR}${entry.definition}`;
}

/** Render the whole file, wrapped to the repository's prettier width. */
export function renderGlossary(doc: IGlossaryDoc): string {
    const body: string[] = [];
    doc.entries.forEach((entry, index) => {
        if (index > 0) body.push('');
        body.push(...wrapText(renderTerm(entry)));
    });
    const lines = [
        ...dropTrailingBlank(doc.prefix),
        '',
        GLOSSARY_START,
        '',
        ...body,
        '',
        GLOSSARY_END,
        ...dropLeadingBlank(doc.suffix),
    ];
    // A single trailing newline, the way every markdown file in the repository ends.
    return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

/** Write the glossary, returning whether the file's bytes changed. */
export function writeGlossary(file: string, doc: IGlossaryDoc): boolean {
    const text = renderGlossary(doc);
    if (text === readFileSync(file, 'utf8')) return false;
    writeFileSync(file, text);
    return true;
}

/** Insert an entry in sorted position, or replace the definition of a term already present. */
export function addTerm(
    doc: IGlossaryDoc,
    term: string,
    definition: string,
): 'added' | 'updated' {
    const key = normalizeTerm(term);
    const index = doc.entries.findIndex(entry => normalizeTerm(entry.term) === key);
    if (index !== -1) {
        doc.entries[index] = {term: doc.entries[index]!.term, definition};
        return 'updated';
    }
    const entry: IGlossaryEntry = {term, definition};
    const at = doc.entries.findIndex(existing => compareTerms(existing.term, term) > 0);
    if (at === -1) doc.entries.push(entry);
    else doc.entries.splice(at, 0, entry);
    return 'added';
}

/** Remove an entry by term, returning the term as it was written, or `undefined` when absent. */
export function removeTerm(doc: IGlossaryDoc, term: string): string | undefined {
    const key = normalizeTerm(term);
    const index = doc.entries.findIndex(entry => normalizeTerm(entry.term) === key);
    if (index === -1) return undefined;
    const [removed] = doc.entries.splice(index, 1);
    return removed!.term;
}

/** Find an entry by term. */
export function findTerm(doc: IGlossaryDoc, term: string): IGlossaryEntry | undefined {
    const key = normalizeTerm(term);
    return doc.entries.find(entry => normalizeTerm(entry.term) === key);
}

/** Put the entries in term order, stably. */
export function sortTerms(doc: IGlossaryDoc): void {
    doc.entries = [...doc.entries].sort((left, right) => compareTerms(left.term, right.term));
}

/** The first out-of-order pair, or `undefined` when the list is sorted. */
export function outOfOrder(doc: IGlossaryDoc): {value: string; before: string} | undefined {
    for (let i = 1; i < doc.entries.length; i++) {
        const previous = doc.entries[i - 1]!;
        const current = doc.entries[i]!;
        if (compareTerms(previous.term, current.term) > 0) {
            return {value: current.term, before: previous.term};
        }
    }
    return undefined;
}

/** Every markdown link target in a definition, in order. */
export function linkTargets(definition: string): string[] {
    const targets: string[] = [];
    let match: RegExpExecArray | null;
    LINK.lastIndex = 0;
    while ((match = LINK.exec(definition)) !== null) {
        if (match[1] !== undefined) targets.push(match[1]);
    }
    return targets;
}

/** Whether a link target points outside the repository. */
function isExternal(target: string): boolean {
    return SCHEME.test(target);
}

/** A local link target's path, with any fragment removed, or `null` when it is an anchor or a URL. */
export function localTarget(target: string): string | null {
    if (isExternal(target) || target.startsWith('#')) return null;
    const [path] = target.split('#');
    return path === undefined || path === '' ? null : path;
}

/** Words in a definition, counting a markdown link as the words of its label. */
export function wordCount(text: string): number {
    return text.trim().split(/\s+/).filter(word => word !== '').length;
}

/** Every problem `check` finds in the glossary: shape, order, length and resolvable links. */
export function checkGlossary(file: string, doc: IGlossaryDoc): IGlossaryProblem[] {
    const problems: IGlossaryProblem[] = [];
    if (!doc.marked) {
        problems.push({message: `no ${GLOSSARY_START} / ${GLOSSARY_END} region`});
    }
    for (const paragraph of doc.malformed) {
        problems.push({message: `not a glossary entry: ${paragraph}`});
    }
    const order = outOfOrder(doc);
    if (order) {
        problems.push({message: `not sorted: "${order.value}" follows "${order.before}"`});
    }
    const seen = new Map<string, string>();
    for (const entry of doc.entries) {
        const key = normalizeTerm(entry.term);
        const previous = seen.get(key);
        if (previous !== undefined) {
            problems.push({term: entry.term, message: `duplicate term (also as "${previous}")`});
        } else {
            seen.set(key, entry.term);
        }
        if (entry.definition.trim() === '') {
            problems.push({term: entry.term, message: 'has no definition'});
            continue;
        }
        const words = wordCount(entry.definition);
        if (words > MAX_DEFINITION_WORDS) {
            problems.push({
                term: entry.term,
                message: `definition is ${words} words (max ${MAX_DEFINITION_WORDS})`,
            });
        }
        const locals = linkTargets(entry.definition)
            .map(target => ({target, path: localTarget(target)}))
            .filter((link): link is {target: string; path: string} => link.path !== null);
        if (locals.length === 0) {
            problems.push({term: entry.term, message: 'has no documentation link'});
        }
        for (const link of locals) {
            if (!existsSync(resolve(dirname(file), link.path))) {
                problems.push({term: entry.term, message: `link does not resolve: ${link.target}`});
            }
        }
    }
    return problems;
}
