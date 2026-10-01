/**
 * The cspell dictionary, read and rewritten by `blong-dev cspell`.
 *
 * cspell's `words` and `ignorePaths` are lists a human appends to, and their order
 * does not matter to cspell — which is exactly why the order drifts. Every manual
 * insertion has to guess where the word belongs, a guess that is one word off is
 * invisible in review, and the result is a list that is sorted in places and not
 * in others. The command owns the two decisions a manual edit gets wrong, the
 * insertion point and the duplicate check, and leaves the rest of the file —
 * comments included — byte for byte as it was.
 *
 * The file is parsed with `yaml`'s document API rather than string-spliced, so a
 * list item carries its own comment when it moves and a glob is quoted when it
 * has to be — YAML reads a leading asterisk as an alias marker — instead of by
 * the caller. An untouched document round-trips byte for byte, which is what lets
 * a write happen only when something actually changed.
 */

import {readFileSync, writeFileSync} from 'node:fs';

import {isScalar, isSeq, parseDocument, Scalar, type Document, type YAMLSeq} from 'yaml';

/** The file the command maintains, resolved by walking up from the working directory. */
export const CSPELL_CONFIG_FILE = 'cspell.config.yaml';

/**
 * The sections the command keeps ordered.
 *
 * cspell accepts more list-valued keys (`flagWords`, `ignoreWords`, `dictionaries`),
 * and they are deliberately left alone: they are either ordered by meaning or owned
 * by a preset, and sorting them would be a change nobody asked for.
 */
export const CSPELL_SECTIONS = ['words', 'ignorePaths'] as const;

/** A section the command maintains. */
export type CspellSection = (typeof CSPELL_SECTIONS)[number];

/** Whether `value` names a section the command maintains. */
export function isCspellSection(value: string): value is CspellSection {
    return (CSPELL_SECTIONS as readonly string[]).includes(value);
}

/**
 * Order two entries the way the file already orders them.
 *
 * Case-insensitively, by code unit. That is the file's own convention: `bge`
 * before `binhex` before `blong`, and `Béziers` after `bullnose` because `é`
 * sorts above `u` — a locale-aware collation would move it next to `bge` and
 * reorder some ninety entries nobody asked to change. Two entries that differ
 * only in case compare equal, so the stable sort leaves them where they were:
 * `semlog` and `Semlog` are one word to cspell, and which of the two is written
 * first is not a judgement worth reversing.
 */
export function compareWords(left: string, right: string): number {
    const a = left.toLowerCase();
    const b = right.toLowerCase();
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
}

/** The text of a list item, however the parser produced it. */
function scalarText(node: unknown): string {
    if (isScalar(node)) {
        const value: unknown = node.value;
        return value === null || value === undefined ? '' : String(value);
    }
    return typeof node === 'string' ? node : String(node);
}

/** Parse the config, refusing a file whose YAML does not parse. */
export function loadCspellConfig(file: string): Document {
    const doc = parseDocument(readFileSync(file, 'utf8'));
    const [problem] = doc.errors;
    if (problem) {
        throw new Error(`${file}: ${problem.message}`);
    }
    return doc;
}

/** Serialise the config exactly as `yaml` renders it (comments preserved). */
export function renderCspellConfig(doc: Document): string {
    return doc.toString();
}

/** Write the config, returning whether the file's bytes changed. */
export function writeCspellConfig(file: string, doc: Document): boolean {
    const text = renderCspellConfig(doc);
    if (text === readFileSync(file, 'utf8')) return false;
    writeFileSync(file, text);
    return true;
}

/** The section as a sequence, or `undefined` when it is absent. */
function asSequence(doc: Document, section: string): YAMLSeq | undefined {
    const node = doc.get(section);
    return isSeq(node) ? node : undefined;
}

/** The section as a sequence, creating an empty one when it is absent. */
function ensureSequence(doc: Document, section: string): YAMLSeq {
    const existing = doc.get(section);
    if (existing !== undefined && !isSeq(existing)) {
        throw new Error(`the cspell config's "${section}" is not a list`);
    }
    const seq = asSequence(doc, section) ?? doc.createNode([]);
    if (existing === undefined) doc.set(section, seq);
    return seq as YAMLSeq;
}

/** Entries of a section, in file order; `undefined` when the section is absent. */
export function sectionValues(doc: Document, section: string): string[] | undefined {
    return asSequence(doc, section)?.items.map(scalarText);
}

/** What one section looks like right now, and what is wrong with it. */
export interface ISectionState {
    /** Section name, e.g. `words`. */
    section: string;
    /** Entries in file order. */
    values: string[];
    /** Whether the entries are in ascending order. */
    sorted: boolean;
    /** The first entry that breaks the order, and the one it should precede. */
    outOfOrder?: {index: number; value: string; before: string};
    /** Values appearing more than once, in order of first appearance. */
    duplicates: string[];
}

/** The sorted/duplicate verdict for a list, independent of any document. */
export function analyseValues(
    values: readonly string[],
): Pick<ISectionState, 'sorted' | 'duplicates'> & {outOfOrder?: ISectionState['outOfOrder']} {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const value of values) {
        if (seen.has(value)) {
            if (!duplicates.includes(value)) duplicates.push(value);
        } else {
            seen.add(value);
        }
    }
    for (let index = 1; index < values.length; index += 1) {
        const previous = values[index - 1]!;
        const value = values[index]!;
        if (compareWords(previous, value) > 0) {
            return {sorted: false, outOfOrder: {index, value, before: previous}, duplicates};
        }
    }
    return {sorted: true, duplicates};
}

/** Read a section's state; `undefined` when the section is absent. */
export function sectionState(doc: Document, section: string): ISectionState | undefined {
    const values = sectionValues(doc, section);
    if (values === undefined) return undefined;
    return {section, values, ...analyseValues(values)};
}

/**
 * Order a section, dropping exact duplicates. Returns `undefined` when the
 * section is absent — ordering is not a reason to create one.
 */
export function sortSection(
    doc: Document,
    section: string,
): {entries: number; removed: string[]; reordered: boolean} | undefined {
    const seq = asSequence(doc, section);
    if (!seq) return undefined;
    const nodes: unknown[] = seq.items;
    const seen = new Set<string>();
    const kept: unknown[] = [];
    const removed: string[] = [];
    for (const node of nodes) {
        const value = scalarText(node);
        if (seen.has(value)) {
            removed.push(value);
            continue;
        }
        seen.add(value);
        kept.push(node);
    }
    kept.sort((left, right) => compareWords(scalarText(left), scalarText(right)));
    const reordered =
        kept.length !== nodes.length || kept.some((node, index) => node !== nodes[index]);
    seq.items = kept;
    return {entries: kept.length, removed, reordered};
}

/** Add entries to a section, keeping it sorted. */
export function addValues(
    doc: Document,
    section: string,
    values: readonly string[],
): {added: string[]; present: string[]; entries: number} {
    const seq = ensureSequence(doc, section);
    const existing = new Set(sectionValues(doc, section) ?? []);
    const added: string[] = [];
    const present: string[] = [];
    for (const value of values) {
        // A word the request repeats is added once; a word already in the file is
        // reported rather than added.
        if (added.includes(value)) continue;
        if (existing.has(value)) {
            if (!present.includes(value)) present.push(value);
            continue;
        }
        seq.add(new Scalar(value));
        added.push(value);
    }
    if (added.length > 0) seq.items.sort((l, r) => compareWords(scalarText(l), scalarText(r)));
    return {added, present, entries: seq.items.length};
}

/** Remove entries from a section. */
export function removeValues(
    doc: Document,
    section: string,
    values: readonly string[],
): {removed: string[]; missing: string[]; entries: number} {
    const seq = asSequence(doc, section);
    if (!seq) return {removed: [], missing: [...new Set(values)], entries: 0};
    const wanted = new Set(values);
    const removed: string[] = [];
    seq.items = seq.items.filter(node => {
        const value = scalarText(node);
        if (!wanted.has(value)) return true;
        wanted.delete(value);
        removed.push(value);
        return false;
    });
    const missing = [...new Set(values)].filter(value => !removed.includes(value));
    return {removed, missing, entries: seq.items.length};
}
