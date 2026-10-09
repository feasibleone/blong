/**
 * `blong-dev glossary` — the writer and validator of the repository's vocabulary.
 *
 * The glossary (`docs/blong/docs/concepts/glossary.md`) is a map of the words this repository uses
 * with a meaning of its own: one bold term, one short definition, one link to the page that
 * explains it. A hand edit gets two things wrong — where the term goes in an alphabetical list, and
 * how long a "short" definition may grow — so the command owns both. `add` inserts the term where
 * it belongs and wraps the sentence; `remove`, `sort` and `list` are the reading side; and `check`
 * is the gate: it fails on an unsorted list, a repeated term, a missing marker, a definition that
 * has become a paragraph, or a link that points at a file which does not exist.
 *
 * Usage:
 *   blong-dev glossary add <term> --definition "<sentence>" [--file <path>]
 *   blong-dev glossary remove <term...>                    [--file <path>]
 *   blong-dev glossary list                                [--json] [--file <path>]
 *   blong-dev glossary show <term>                         [--json] [--file <path>]
 *   blong-dev glossary sort                                [--check] [--json] [--file <path>]
 *   blong-dev glossary check                               [--json] [--file <path>]
 *
 * `--file` points at a glossary other than the repository's own, found from the working directory's
 * repository root.
 */

import {existsSync} from 'node:fs';
import {isAbsolute, join, resolve} from 'node:path';

import {
    GLOSSARY_FILE,
    addTerm,
    checkGlossary,
    findTerm,
    isTerm,
    loadGlossary,
    outOfOrder,
    removeTerm,
    renderTerm,
    sortTerms,
    writeGlossary,
    type IGlossaryDoc,
    type IGlossaryEntry,
} from '../glossary/glossaryDoc.ts';
import {repoRoot} from '../report/reportPaths.ts';
import {parseArgs} from './log.ts';

const USAGE = [
    'Usage:',
    '  blong-dev glossary add <term> --definition "<sentence>" [--file <path>]',
    '  blong-dev glossary remove <term...>                    [--file <path>]',
    '  blong-dev glossary list                                [--json] [--file <path>]',
    '  blong-dev glossary show <term>                         [--json] [--file <path>]',
    '  blong-dev glossary sort                                [--check] [--json] [--file <path>]',
    '  blong-dev glossary check                               [--json] [--file <path>]',
    '',
    `Glossary: ${GLOSSARY_FILE} (found from the working directory's repository root)`,
    'A definition is one sentence and points at the page that explains the term.\n',
].join('\n');

/** A caller mistake: the message is the whole report, and the exit code is 1. */
class UsageError extends Error {}

/** `blong-dev glossary <verb> [...]` */
export async function glossary(args: string[]): Promise<void> {
    const {positionals, options, flags} = parseArgs(args);
    const [verb, ...values] = positionals;
    if (verb === undefined || verb === 'help' || flags.has('help')) {
        process.stdout.write(USAGE);
        return;
    }
    const json = flags.has('json');
    try {
        switch (verb) {
            case 'add':
                return add(values, options, json);
            case 'remove':
                return remove(values, options, json);
            case 'list':
                return list(options, json);
            case 'show':
                return show(values, options, json);
            case 'sort':
                return sort(options, flags.has('check'), json);
            case 'check':
                return sort(options, true, json);
            default:
                throw new UsageError(`unknown verb "${verb}"`);
        }
    } catch (error) {
        if (!(error instanceof UsageError)) throw error;
        process.stderr.write(`blong-dev glossary: ${error.message}\n${USAGE}`);
        process.exitCode = 1;
    }
}

/** The glossary to maintain: `--file`, else the repository's own. */
function glossaryFile(options: Map<string, string>): string {
    const explicit = options.get('file');
    if (explicit !== undefined) {
        const file = isAbsolute(explicit) ? explicit : resolve(explicit);
        if (!existsSync(file)) throw new UsageError(`no such file: ${explicit}`);
        return file;
    }
    return join(repoRoot(process.cwd()), GLOSSARY_FILE);
}

/** Load the glossary, refusing to rewrite one whose region holds paragraphs it cannot own. */
function load(file: string): IGlossaryDoc {
    const doc = loadGlossary(file);
    if (doc.malformed.length > 0) {
        throw new UsageError(
            `${file} has ${doc.malformed.length} paragraph(s) that are not entries; ` +
                `fix them first: "${doc.malformed[0]}"`,
        );
    }
    return doc;
}

/** Write the `--json` form of a report. */
function report(value: unknown, json: boolean): boolean {
    if (!json) return false;
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return true;
}

/** The definition, from `--definition`, trimmed to one logical line. */
function definitionOf(options: Map<string, string>): string {
    const raw = options.get('definition');
    if (raw === undefined) throw new UsageError('add needs --definition "<sentence>"');
    const definition = raw.trim().replace(/\s+/g, ' ');
    if (definition === '') throw new UsageError('--definition is empty');
    return definition;
}

/** Add a term, or update the definition of one already there. */
function add(values: string[], options: Map<string, string>, json: boolean): void {
    const term = values[0];
    if (term === undefined) throw new UsageError('add needs a term');
    if (values.length > 1) throw new UsageError('add takes a single term');
    if (!isTerm(term)) {
        throw new UsageError(
            `"${term}" is not a term (words of letters and digits, single spaces or hyphens)`,
        );
    }
    const definition = definitionOf(options);
    const file = glossaryFile(options);
    const doc = load(file);
    const action = addTerm(doc, term, definition);
    sortTerms(doc);
    writeGlossary(file, doc);
    if (report({file, term, action, entries: doc.entries.length}, json)) return;
    process.stdout.write(
        `# glossary add: ${action} "${term}" (${doc.entries.length} entries)\n`,
    );
}

/** Remove one or more terms. */
function remove(values: string[], options: Map<string, string>, json: boolean): void {
    if (values.length === 0) throw new UsageError('remove needs at least one term');
    const file = glossaryFile(options);
    const doc = load(file);
    const removed: string[] = [];
    const missing: string[] = [];
    for (const term of values) {
        const was = removeTerm(doc, term);
        if (was === undefined) missing.push(term);
        else removed.push(was);
    }
    writeGlossary(file, doc);
    if (report({file, removed, missing, entries: doc.entries.length}, json)) return;
    if (removed.length > 0) {
        process.stdout.write(
            `# glossary remove: removed ${removed.join(', ')} (${doc.entries.length} entries)\n`,
        );
    }
    if (missing.length > 0) {
        process.stdout.write(`# glossary remove: no such term: ${missing.join(', ')}\n`);
    }
}

/** Print every term. */
function list(options: Map<string, string>, json: boolean): void {
    const file = glossaryFile(options);
    const doc = loadGlossary(file);
    if (report({file, entries: doc.entries}, json)) return;
    for (const entry of doc.entries) process.stdout.write(`${entry.term}\n`);
}

/** Print one entry. */
function show(values: string[], options: Map<string, string>, json: boolean): void {
    const term = values[0];
    if (term === undefined) throw new UsageError('show needs a term');
    const file = glossaryFile(options);
    const doc = loadGlossary(file);
    const entry = findTerm(doc, term);
    if (entry === undefined) throw new UsageError(`no such term: ${term}`);
    if (report({file, ...entry}, json)) return;
    process.stdout.write(`${renderTerm(entry)}\n`);
}

/** The line that says how many entries the glossary holds. */
function describe(doc: IGlossaryDoc): string {
    const count = doc.entries.length;
    return `${count} ${count === 1 ? 'entry' : 'entries'}`;
}

/** Sort the entries, or (with `--check`) report the problems instead of fixing them. */
function sort(options: Map<string, string>, check: boolean, json: boolean): void {
    const file = glossaryFile(options);
    const doc = loadGlossary(file);
    if (check) {
        const problems = checkGlossary(file, doc);
        if (report({file, ok: problems.length === 0, problems, entries: doc.entries.length}, json)) {
            if (problems.length > 0) process.exitCode = 1;
            return;
        }
        for (const problem of problems) {
            const prefix = problem.term === undefined ? '' : `${problem.term}: `;
            process.stdout.write(`# glossary check: ${prefix}${problem.message}\n`);
        }
        if (problems.length === 0) {
            process.stdout.write(`# glossary check: ${describe(doc)} in order\n`);
        } else {
            process.stderr.write('blong-dev glossary: fix the problems above\n');
            process.exitCode = 1;
        }
        return;
    }

    const order = outOfOrder(doc);
    const before = doc.entries.length;
    sortTerms(doc);
    const changed = writeGlossary(file, doc);
    if (report({file, entries: doc.entries.length, changed, outOfOrder: order?.value}, json)) return;
    if (!changed) {
        process.stdout.write(`# glossary sort: ${describe(doc)} already in order\n`);
        return;
    }
    const reordered = order ? `, "${order.value}" moved after "${order.before}"` : '';
    process.stdout.write(`# glossary sort: ${before} entries reordered${reordered}\n`);
}
