/**
 * `blong-dev cspell` — the writer and the gate for the cspell dictionary.
 *
 * `words` and `ignorePaths` in `cspell.config.yaml` are lists that cspell reads in
 * any order, so the order is only ever maintained by hand — and a hand that has to
 * guess the insertion point gets it wrong in ways review cannot see. This command
 * owns the guess instead: `add` inserts a word where it belongs, `sort` puts an
 * already-drifted list back in order, and `check` is the gate that says when
 * somebody edited the file by hand.
 *
 * Nothing else in the file is touched: comments stay on their entries, the
 * surrounding keys are untouched, and a run that changes nothing writes nothing.
 *
 * Usage:
 *   blong-dev cspell add <word...>       [--section <name>] [--file <path>]
 *   blong-dev cspell remove <word...>    [--section <name>] [--file <path>]
 *   blong-dev cspell sort                [--check] [--section <name>] [--file <path>] [--json]
 *   blong-dev cspell check               [--section <name>] [--file <path>] [--json]
 *   blong-dev cspell list                [--section <name>] [--file <path>] [--json]
 *
 * `--section` names one of `words` (the default for `add` and `remove`) and
 * `ignorePaths`; both are maintained by `sort` and `check` unless `--section`
 * narrows it. `--file` points at a config other than the nearest one found by
 * walking up from the working directory.
 */

import {existsSync} from 'node:fs';
import {resolve} from 'node:path';

import {
    addValues,
    CSPELL_CONFIG_FILE,
    CSPELL_SECTIONS,
    isCspellSection,
    loadCspellConfig,
    removeValues,
    sectionState,
    sortSection,
    writeCspellConfig,
    type CspellSection,
    type ISectionState,
} from '../cspell/cspellConfig.ts';
import {findUp} from '../utils/findConfig.ts';
import {parseArgs} from './log.ts';

const USAGE = [
    'Usage:',
    '  blong-dev cspell add <word...>    [--section <name>] [--file <path>]',
    '  blong-dev cspell remove <word...> [--section <name>] [--file <path>]',
    '  blong-dev cspell sort             [--check] [--section <name>] [--file <path>] [--json]',
    '  blong-dev cspell check            [--section <name>] [--file <path>] [--json]',
    '  blong-dev cspell list             [--section <name>] [--file <path>] [--json]',
    `\nSections: ${CSPELL_SECTIONS.join(', ')}`,
    `Config: ${CSPELL_CONFIG_FILE}, found from the working directory unless --file names one\n`,
].join('\n');

/** A caller mistake: the message is the whole report, and the exit code is 1. */
class UsageError extends Error {}

/** `blong-dev cspell <verb> [...]` */
export async function cspell(args: string[]): Promise<void> {
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
            case 'sort':
                return sort(options, flags.has('check'), json);
            case 'check':
                return sort(options, true, json);
            case 'list':
                return list(options, json);
            default:
                throw new UsageError(`unknown verb "${verb}"`);
        }
    } catch (error) {
        if (!(error instanceof UsageError)) throw error;
        process.stderr.write(`blong-dev cspell: ${error.message}\n${USAGE}`);
        process.exitCode = 1;
    }
}

/** The config to maintain: `--file`, else the nearest one up the tree. */
function configFile(options: Map<string, string>): string {
    const explicit = options.get('file');
    if (explicit !== undefined) {
        const file = resolve(explicit);
        if (!existsSync(file)) throw new UsageError(`no such file: ${explicit}`);
        return file;
    }
    const found = findUp(process.cwd(), CSPELL_CONFIG_FILE);
    if (!found) throw new UsageError(`no ${CSPELL_CONFIG_FILE} found from ${process.cwd()}`);
    return found;
}

/** The sections a run acts on, from `--section` or from the verb's default. */
function requestedSections(
    options: Map<string, string>,
    fallback: readonly CspellSection[],
): CspellSection[] {
    const raw = options.get('section');
    if (raw === undefined) return [...fallback];
    const names = raw
        .split(',')
        .map(name => name.trim())
        .filter(name => name !== '');
    if (names.length === 0) throw new UsageError('--section needs a section name');
    for (const name of names) {
        if (!isCspellSection(name)) {
            throw new UsageError(
                `unknown section "${name}" (known: ${CSPELL_SECTIONS.join(', ')})`,
            );
        }
    }
    return names as CspellSection[];
}

/** One section, for the verbs that edit a single one. */
function singleSection(options: Map<string, string>): CspellSection {
    const fallback: CspellSection[] = ['words'];
    const sections = requestedSections(options, fallback);
    if (sections.length !== 1) throw new UsageError('add and remove edit one section at a time');
    return sections[0]!;
}

/** Write the `--json` form of a report. */
function report(value: unknown, json: boolean): boolean {
    if (!json) return false;
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return true;
}

/** Add words, keeping the list sorted. */
function add(values: string[], options: Map<string, string>, json: boolean): void {
    if (values.length === 0) throw new UsageError('add needs at least one word');
    const file = configFile(options);
    const section = singleSection(options);
    const doc = loadCspellConfig(file);
    const {added, present, entries} = addValues(doc, section, values);
    writeCspellConfig(file, doc);
    if (report({file, section, added, present, entries}, json)) return;
    if (added.length > 0) {
        process.stdout.write(
            `# cspell add: ${section} += ${added.join(', ')} (${entries} entries)\n`,
        );
    }
    if (present.length > 0) {
        process.stdout.write(`# cspell add: ${section} already has ${present.join(', ')}\n`);
    }
}

/** Remove words. */
function remove(values: string[], options: Map<string, string>, json: boolean): void {
    if (values.length === 0) throw new UsageError('remove needs at least one word');
    const file = configFile(options);
    const section = singleSection(options);
    const doc = loadCspellConfig(file);
    const {removed, missing, entries} = removeValues(doc, section, values);
    writeCspellConfig(file, doc);
    if (report({file, section, removed, missing, entries}, json)) return;
    if (removed.length > 0) {
        process.stdout.write(
            `# cspell remove: ${section} -= ${removed.join(', ')} (${entries} entries)\n`,
        );
    }
    if (missing.length > 0) {
        process.stdout.write(`# cspell remove: ${section} has no ${missing.join(', ')}\n`);
    }
}

/** The line that says where a section stands. */
function describe(state: ISectionState): string {
    return `${state.section} (${state.values.length})`;
}

/** Sort the sections, or (with `--check`) report the ones that are not sorted. */
function sort(options: Map<string, string>, check: boolean, json: boolean): void {
    const file = configFile(options);
    const doc = loadCspellConfig(file);
    const sections = requestedSections(options, CSPELL_SECTIONS);
    const states = sections
        .map(section => sectionState(doc, section))
        .filter((state): state is ISectionState => state !== undefined);
    if (states.length === 0) {
        throw new UsageError(`none of ${sections.join(', ')} is present in ${file}`);
    }
    const problems = states.filter(state => !state.sorted || state.duplicates.length > 0);

    if (check) {
        if (
            report(
                {
                    file,
                    ok: problems.length === 0,
                    sections: states.map(state => ({
                        section: state.section,
                        entries: state.values.length,
                        sorted: state.sorted,
                        duplicates: state.duplicates,
                    })),
                },
                json,
            )
        ) {
            if (problems.length > 0) process.exitCode = 1;
            return;
        }
        for (const state of problems) {
            if (state.outOfOrder) {
                process.stdout.write(
                    `# cspell check: ${state.section} is not sorted: "${state.outOfOrder.value}" follows "${state.outOfOrder.before}"\n`,
                );
            }
            if (state.duplicates.length > 0) {
                process.stdout.write(
                    `# cspell check: ${state.section} repeats ${state.duplicates.join(', ')}\n`,
                );
            }
        }
        if (problems.length === 0) {
            process.stdout.write(`# cspell check: ${states.map(describe).join(', ')} sorted\n`);
        } else {
            process.stderr.write('blong-dev cspell: run `blong-dev cspell sort` to fix\n');
            process.exitCode = 1;
        }
        return;
    }

    const results = [];
    for (const state of states) {
        const healthy = state.sorted && state.duplicates.length === 0;
        const result = healthy ? undefined : sortSection(doc, state.section);
        results.push({
            section: state.section,
            entries: result?.entries ?? state.values.length,
            changed: !healthy,
            removed: result?.removed ?? [],
        });
    }
    writeCspellConfig(file, doc);
    if (report({file, sections: results}, json)) return;
    const changed = results.filter(result => result.changed);
    if (changed.length === 0) {
        process.stdout.write(`# cspell sort: ${states.map(describe).join(', ')} already sorted\n`);
        return;
    }
    for (const result of changed) {
        const removed =
            result.removed.length > 0 ? `, ${result.removed.length} duplicate(s) removed` : '';
        process.stdout.write(
            `# cspell sort: ${result.section} (${result.entries} entries) reordered${removed}\n`,
        );
    }
}

/** Print the entries of the maintained sections. */
function list(options: Map<string, string>, json: boolean): void {
    const file = configFile(options);
    const doc = loadCspellConfig(file);
    const sections = requestedSections(options, CSPELL_SECTIONS);
    const values: Record<string, string[]> = {};
    for (const section of sections) {
        values[section] = sectionState(doc, section)?.values ?? [];
    }
    if (report({file, sections: values}, json)) return;
    for (const [section, entries] of Object.entries(values)) {
        process.stdout.write(`# cspell list: ${section} (${entries.length} entries)\n`);
        for (const entry of entries) process.stdout.write(`${entry}\n`);
    }
}
