/**
 * `blong-dev memory` — the writer and validator of the agent memory files.
 *
 * Agents never hand-edit these files: the command owns the ids, the section an
 * entry belongs in, the wrapping and the generated index, so the format stays
 * consistent without anyone remembering it. `check` is the gate (also wired into
 * the staged-file lint), `list --json` and `show` are how an agent reads them
 * without loading a whole file.
 *
 * Usage:
 *   blong-dev memory add <friction|todo|decision> --title <title> [--area <area>]
 *                        [--body <text> | --body-file <file>] [--status <status>] [--id <id>]
 *   blong-dev memory list [--kind <kind>] [--area <area>] [--status <status>] [--search <text>] [--json]
 *   blong-dev memory show <id> [--json]
 *   blong-dev memory close <id> [--note <text>] [--keep] [--by <id>] [--reason <text>]
 *   blong-dev memory reopen <id>
 *   blong-dev memory move <id> --area <area>
 *   blong-dev memory index [--check] [--files a.md,b.md]
 *   blong-dev memory format [--check] [--files a.md,b.md]
 *   blong-dev memory check [--files a.md,b.md] [--json] [--no-spell]
 *   blong-dev memory manual <list|add <text>|done <n|text>>
 *   blong-dev memory audit [--json]
 *   blong-dev memory migrate <file> --kind <kind> [--drop <file>] [--apply]
 *   blong-dev memory prune <id,id> --reason "<why>"
 */

import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {relative, resolve} from 'node:path';

import {
    checkDoc,
    describeProblem,
    type ICheckContext,
    type IProblem,
} from '../memory/memoryCheck.ts';
import {
    addManualItems,
    applyEntries,
    bodyLines,
    canonicalise,
    ensureDoc,
    ensureManualSection,
    entryLines,
    formatId,
    highestId,
    insertEntry,
    manualItem,
    nextId,
    refreshIndex,
    removeEntry,
    replaceMeta,
    sectionForStatus,
    skeleton,
    writeDoc,
} from '../memory/memoryEdit.ts';
import {formatLines, renderLines, wrapText} from '../memory/memoryFormat.ts';
import {mergePlans, duplicateEntries, parseImport} from '../memory/memoryImport.ts';
import {migrateLegacy, parseBlameDates, parseDropList} from '../memory/memoryMigrate.ts';
import {parseDoc, readDoc, splitLines} from '../memory/memoryParse.ts';
import {
    describeFile,
    isKnownArea,
    isReservedArea,
    listMemoryFiles,
    memoryFile,
    packageAreas,
    projectFolderForName,
    scopeOf,
    type IMemoryFileRef,
} from '../memory/memoryPaths.ts';
import {
    DEFAULT_STATUS,
    ENTRY_HEADING,
    KIND_STATUSES,
    MAX_TITLE_LENGTH,
    SECTION_FOR_STATUS,
    type IMemoryDoc,
    type IMemoryEntry,
    type MemoryKind,
} from '../memory/memoryTypes.ts';
import {repoRoot} from '../report/reportPaths.ts';
import {findUp} from '../utils/findConfig.ts';
import {runTool} from '../utils/runTool.ts';
import {toolEnv} from '../utils/toolPath.ts';
import {parseArgs} from './log.ts';

const USAGE = [
    'blong-dev memory add <friction|todo|decision> --title <title> [--area <area>] [--body <text>]',
    'blong-dev memory list [--kind <kind>] [--area <area>] [--status <status>] [--search <text>] [--json]',
    'blong-dev memory show <id> [--json]',
    'blong-dev memory edit <id> [--title <title>] [--body <text>|--body-file <file>] [--status <status>]',
    'blong-dev memory close <id> [--note <text>] [--keep] [--by <id>] [--reason <text>]',
    'blong-dev memory reopen <id>',
    'blong-dev memory move <id> --area <area>',
    'blong-dev memory index|format|check [--files a.md,b.md]',
    'blong-dev memory manual <list|add <text>|done <n|text>>',
    'blong-dev memory audit [--json]',
    'blong-dev memory migrate <file> --kind <kind> [--default-area <area>] [--drop <file>] [--apply]',
    'blong-dev memory import <file.json> [...] [--kind <kind>] [--apply] [--force]',
    'blong-dev memory prune <id,id> --reason "<why>"',
].join('\n');

const KIND_ALIAS: Record<string, MemoryKind> = {
    f: 'friction',
    friction: 'friction',
    t: 'todo',
    todo: 'todo',
    d: 'decision',
    decision: 'decision',
};

/** Legacy topic prefixes that name a reserved area or a package, not a title. */
const TOPIC_AREAS: Record<string, string> = {
    ci: 'ci',
    'ci report': 'ci',
    docs: 'docs',
    'kukum docs': 'docs',
    skills: 'skills',
    'blong-theme skill': 'skills',
    'wood theme design-match': 'core/blong-browser',
    'wood theme: bevel, buttons, typography': 'core/blong-browser',
    'blong-browser theme switcher': 'core/blong-browser',
    'commander polish': 'realm/blong-commander',
    'commander bug-fix pass': 'realm/blong-commander',
    primereact: 'core/blong-browser',
    'prime react': 'core/blong-browser',
    'wood theme': 'core/blong-browser',
};

type Options = Map<string, string>;

/** Resolve a kind from a CLI word, or `null`. */
function kindOf(value: string | undefined): MemoryKind | null {
    return value ? (KIND_ALIAS[value.toLowerCase()] ?? null) : null;
}

/** Today as YYYY-MM-DD. */
function today(): string {
    return new Date().toISOString().slice(0, 10);
}

/** Thrown by {@link fail} so the command stops without a stack trace. */
class UsageError extends Error {}

/** Report a usage error and stop the command. */
function fail(message: string): never {
    process.stderr.write(`blong-dev: ${message}\n${USAGE}\n`);
    process.exitCode = 1;
    throw new UsageError(message);
}

/**
 * Refuse to edit a file that has not been migrated to the memory format yet.
 *
 * Every file in the format carries a generated index; a file without one still
 * holds the legacy shape, where an inserted entry would land next to prose the
 * parser cannot describe. `check` is the diagnostic for those files, so it is
 * deliberately not guarded.
 */
function assertMigrated(doc: IMemoryDoc): void {
    if (parseDoc(doc.lines).indexRange) return;
    fail(
        `${relative(repoRoot(process.cwd()), doc.path)} is not in the memory format yet ` +
            '(no generated index block) — migrate it before `memory add`/`close`/`move` can touch it',
    );
}

/** The files a command works on, honouring `--files`, `--kind` and `--area`. */
function docsOf(root: string, options: Options): IMemoryDoc[] {
    const explicit = options.get('files');
    if (explicit) {
        return explicit
            .split(',')
            .map(entry => resolve(entry.trim()))
            .filter(path => existsSync(path))
            .map(path => {
                const described = describeFile(root, path);
                return described ? readDoc(path, described.kind, described.scope) : null;
            })
            .filter((doc): doc is IMemoryDoc => doc !== null);
    }

    const kind = options.get('kind') ? kindOf(options.get('kind')) : null;
    const area = options.get('area')?.trim();
    const scope =
        options.get('scope')?.trim() ?? (area && !isReservedArea(area) ? area : undefined);
    const references: IMemoryFileRef[] = listMemoryFiles(root).filter(file => {
        if (kind && file.kind !== kind) return false;
        if (scope && file.scope !== scope) return false;
        return true;
    });
    return references.map(file => readDoc(file.path, file.kind, file.scope));
}

/** Find an entry by id across every memory file. */
function findEntry(root: string, id: string): {doc: IMemoryDoc; entry: IMemoryEntry} | null {
    const wanted = id.toUpperCase();
    for (const file of listMemoryFiles(root)) {
        const doc = readDoc(file.path, file.kind, file.scope);
        const entry = parseDoc(doc.lines).entries.find(candidate => candidate.id === wanted);
        if (entry) return {doc, entry};
    }
    return null;
}

/** Replace the status of an entry and move it to the matching section. */
function setStatus(
    doc: IMemoryDoc,
    entry: IMemoryEntry,
    status: string,
    body: readonly string[],
): void {
    removeEntry(doc, entry);
    insertEntry(
        doc,
        SECTION_FOR_STATUS[status] ?? 'Open',
        entryLines(entry.id, entry.title, {...entry.meta!, status}, body),
    );
    refreshIndex(doc);
    writeDoc(doc);
}

/**
 * Append paragraphs to a body, each separated by a blank line.
 *
 * Without the blank line markdown treats the appended text as a continuation of
 * the previous paragraph, which is not what "resolved: …" is.
 */
function appendParagraphs(
    body: readonly string[],
    additions: ReadonlyArray<readonly string[]>,
): string[] {
    const out = [...body];
    for (const addition of additions) {
        if (addition.length === 0) continue;
        if (out.length > 0) out.push('');
        out.push(...addition);
    }
    return out;
}

/** Body lines supplied through `--body` or `--body-file`. */
function bodyFromOptions(options: Options): string[] {
    const file = options.get('body-file');
    if (file) {
        const path = resolve(file.trim());
        if (!existsSync(path)) fail(`no such body file: ${path}`);
        return bodyLines(readFileSync(path, 'utf8'));
    }
    const inline = options.get('body');
    return inline ? bodyLines(inline) : [];
}

async function add(root: string, args: string[], options: Options): Promise<void> {
    const kind = kindOf(args[0]);
    if (!kind) fail('memory add needs a kind: friction, todo or decision');

    const title = (options.get('title') ?? args.slice(1).join(' ')).trim();
    if (!title) fail('memory add needs --title <title>');
    if (title.length > MAX_TITLE_LENGTH) {
        fail(`title is ${title.length} characters; keep it under ${MAX_TITLE_LENGTH}`);
    }

    const area = (options.get('area') ?? 'cross-cutting').trim();
    if (!isKnownArea(root, area)) {
        fail(`unknown area "${area}" — use a package folder or cross-cutting, ci, docs, skills`);
    }

    const status = (options.get('status') ?? DEFAULT_STATUS[kind]).trim();
    if (!KIND_STATUSES[kind].includes(status)) {
        fail(`status "${status}" is not one of ${KIND_STATUSES[kind].join(', ')}`);
    }

    const id = (options.get('id') ?? nextId(root, kind)).toUpperCase();
    const date = (options.get('date') ?? today()).trim();
    const body = bodyFromOptions(options);

    const doc = ensureDoc(root, area, kind);
    assertMigrated(doc);
    insertEntry(
        doc,
        SECTION_FOR_STATUS[status] ?? 'Open',
        entryLines(id, title, {date, area, status}, body),
    );
    refreshIndex(doc);
    writeDoc(doc);

    process.stdout.write(`# ${id} ${status} · ${area}\n`);
    process.stdout.write(`# ${relative(root, doc.path)}\n`);
}

/**
 * Correct an entry that is already written.
 *
 * The body is the part that usually needs fixing (a checker finding, a wording
 * that reads badly), and rewriting it by hand would break the format the CLI
 * owns, so the entry is re-rendered from its parsed parts.
 */
function edit(root: string, id: string | undefined, options: Options): void {
    if (!id)
        fail(
            'memory edit <id> [--title <title>] [--body <text>|--body-file <file>] [--status <status>]',
        );
    const found = findEntry(root, id);
    if (!found) fail(`no entry with id ${id}`);
    const {doc, entry} = found;
    assertMigrated(doc);

    const meta = entry.meta!;
    const title = (options.get('title') ?? entry.title).trim();
    if (title.length > MAX_TITLE_LENGTH) {
        fail(`title is ${title.length} characters; keep it under ${MAX_TITLE_LENGTH}`);
    }
    const status = (options.get('status') ?? meta.status).trim();
    if (!KIND_STATUSES[doc.kind].includes(status)) {
        fail(`status "${status}" is not one of ${KIND_STATUSES[doc.kind].join(', ')}`);
    }
    const hasBody = options.has('body') || options.has('body-file');
    const body = hasBody ? bodyFromOptions(options) : entry.body;
    if (hasBody && body.length === 0 && entry.body.length > 0) {
        // An empty `--body-file` is nearly always a broken extraction, and it would
        // quietly erase the entry's text.
        fail('the new body is empty — pass --body with text, or fix the body file');
    }

    removeEntry(doc, entry);
    insertEntry(
        doc,
        SECTION_FOR_STATUS[status] ?? 'Open',
        entryLines(entry.id, title, {...meta, status}, body),
    );
    refreshIndex(doc);
    writeDoc(doc);
    process.stdout.write(`# ${entry.id} edited · ${title}\n# ${relative(root, doc.path)}\n`);
}

function list(root: string, options: Options, flags: Set<string>): void {
    const status = options.get('status')?.trim();
    const area = options.get('area')?.trim();
    const search = options.get('search')?.toLowerCase();

    const found = docsOf(root, options).flatMap(doc =>
        parseDoc(doc.lines).entries.map(entry => ({doc, entry})),
    );
    const selected = found.filter(({entry}) => {
        if (status && entry.meta?.status !== status) return false;
        if (area && entry.meta?.area !== area) return false;
        if (search) {
            const haystack = `${entry.title} ${entry.body.join(' ')}`.toLowerCase();
            if (!haystack.includes(search)) return false;
        }
        return true;
    });

    if (flags.has('json')) {
        process.stdout.write(
            `${JSON.stringify(
                selected.map(({doc, entry}) => ({
                    id: entry.id,
                    kind: doc.kind,
                    scope: doc.scope,
                    path: relative(root, doc.path),
                    ...entry.meta,
                    title: entry.title,
                })),
                null,
                2,
            )}\n`,
        );
        return;
    }

    for (const {doc, entry} of selected) {
        const meta = entry.meta;
        process.stdout.write(
            `# ${entry.id} ${meta?.status ?? '?'} · ${meta?.area ?? '?'} — ${entry.title}` +
                ` (${relative(root, doc.path)})\n`,
        );
    }
    process.stdout.write(`# ${selected.length} entry(ies) of ${found.length} in scope\n`);
}

function show(root: string, id: string | undefined, flags: Set<string>): void {
    if (!id) fail('memory show needs an id');
    const found = findEntry(root, id);
    if (!found) fail(`no entry with id ${id}`);
    const {doc, entry} = found;
    if (flags.has('json')) {
        process.stdout.write(
            `${JSON.stringify({...entry, kind: doc.kind, scope: doc.scope, path: relative(root, doc.path)}, null, 2)}\n`,
        );
        return;
    }
    process.stdout.write(`${relative(root, doc.path)}\n`);
    const block = entryLines(
        entry.id,
        entry.title,
        entry.meta ?? {date: '?', area: '?', status: '?'},
        entry.body,
    );
    process.stdout.write(`${block.join('\n')}\n`);
}

function close(root: string, id: string | undefined, options: Options, flags: Set<string>): void {
    if (!id) fail('memory close needs an id');
    const found = findEntry(root, id);
    if (!found) fail(`no entry with id ${id}`);
    const {doc, entry} = found;
    const note = options.get('note');
    assertMigrated(doc);

    if (doc.kind === 'todo' && !flags.has('keep')) {
        removeEntry(doc, entry);
        refreshIndex(doc);
        writeDoc(doc);
        process.stdout.write(`# ${entry.id} done and removed\n# ${entry.title}\n`);
        return;
    }

    const additions: Array<readonly string[]> = [];
    let status = doc.kind === 'friction' ? 'resolved' : 'done';
    if (doc.kind === 'decision') {
        const by = options.get('by')?.toUpperCase();
        const reason = options.get('reason');
        if (!by && !reason) fail('closing a decision needs --by <id> or --reason <text>');
        status = 'superseded';
        if (reason) additions.push(bodyLines(reason));
        if (by) additions.push(bodyLines(`Superseded by \`${by}\`.`));
    }
    if (note) additions.push(bodyLines(note));

    setStatus(doc, entry, status, appendParagraphs(entry.body, additions));
    process.stdout.write(`# ${entry.id} ${status}\n# ${entry.title}\n`);
}

function reopen(root: string, id: string | undefined): void {
    if (!id) fail('memory reopen needs an id');
    const found = findEntry(root, id);
    if (!found) fail(`no entry with id ${id}`);
    const {doc, entry} = found;
    assertMigrated(doc);
    const status = doc.kind === 'decision' ? 'active' : 'open';
    setStatus(doc, entry, status, entry.body);
    process.stdout.write(`# ${entry.id} ${status}\n`);
}

function move(root: string, id: string | undefined, options: Options): void {
    if (!id) fail('memory move needs an id');
    const area = options.get('area')?.trim();
    if (!area) fail('memory move needs --area <area>');
    if (!isKnownArea(root, area)) fail(`unknown area "${area}"`);
    const found = findEntry(root, id);
    if (!found) fail(`no entry with id ${id}`);
    const {doc, entry} = found;
    assertMigrated(doc);
    if (entry.meta?.area === area) {
        process.stdout.write(`# ${entry.id} already in ${area}\n`);
        return;
    }

    const target = ensureDoc(root, area, doc.kind);
    if (target.path === doc.path) {
        // Both areas live in the root scope, so the entry only changes address.
        replaceMeta(doc, entry, {...entry.meta!, area});
        refreshIndex(doc);
        writeDoc(doc);
        process.stdout.write(`# ${entry.id} area ${area}\n`);
        return;
    }

    insertEntry(
        target,
        SECTION_FOR_STATUS[entry.meta!.status] ?? 'Open',
        entryLines(entry.id, entry.title, {...entry.meta!, area}, entry.body),
    );
    refreshIndex(target);
    writeDoc(target);

    removeEntry(doc, entry);
    refreshIndex(doc);
    writeDoc(doc);

    process.stdout.write(`# ${entry.id} moved to ${relative(root, target.path)}\n`);
}

function index(root: string, options: Options, flags: Set<string>): void {
    const docs = docsOf(root, options);
    let stale = 0;
    for (const doc of docs) {
        assertMigrated(doc);
        const before = renderLines(doc.lines);
        refreshIndex(doc);
        const after = renderLines(doc.lines);
        if (before !== after) stale += 1;
        if (!flags.has('check')) writeDoc(doc);
    }
    process.stdout.write(
        flags.has('check')
            ? `# memory index: ${stale} of ${docs.length} file(s) out of date\n`
            : `# memory index: ${docs.length} file(s), ${stale} updated\n`,
    );
    if (flags.has('check') && stale > 0) process.exitCode = 1;
}

function format(root: string, options: Options, flags: Set<string>): void {
    const docs = docsOf(root, options);
    let changed = 0;
    for (const doc of docs) {
        assertMigrated(doc);
        const before = renderLines(doc.lines);
        doc.lines = formatLines(doc.lines);
        canonicalise(doc);
        const after = renderLines(doc.lines);
        if (before === after) continue;
        changed += 1;
        if (!flags.has('check')) writeDoc(doc);
    }
    process.stdout.write(
        flags.has('check')
            ? `# memory format: ${changed} of ${docs.length} file(s) would change\n`
            : `# memory format: ${changed} of ${docs.length} file(s) reformatted\n`,
    );
    if (flags.has('check') && changed > 0) process.exitCode = 1;
}

/** cspell over the selected files, reported as a single problem when it fails. */
async function spellProblems(root: string, docs: IMemoryDoc[]): Promise<IProblem[]> {
    if (docs.length === 0) return [];
    const config = findUp(root, 'cspell.config.yaml');
    if (!config) return [];
    try {
        const code = await runTool(
            'cspell',
            [
                '--no-progress',
                '--no-summary',
                '--no-must-find-files',
                '--config',
                config,
                ...docs.map(doc => relative(root, doc.path)),
            ],
            {cwd: root, env: toolEnv(root)},
        );
        return code === 0
            ? []
            : [
                  {
                      file: config,
                      line: 0,
                      message: 'cspell found unknown words (see above)',
                      severity: 'error',
                  },
              ];
    } catch (error) {
        // A missing cspell is an environment gap, not a memory-file defect.
        return [
            {
                file: config,
                line: 0,
                message: `cspell could not run: ${(error as Error).message}`,
                severity: 'warning',
            },
        ];
    }
}

async function check(root: string, options: Options, flags: Set<string>): Promise<void> {
    const docs = docsOf(root, options);
    const ids = new Map<string, string>();
    for (const file of listMemoryFiles(root)) {
        const doc = readDoc(file.path, file.kind, file.scope);
        for (const entry of parseDoc(doc.lines).entries) {
            if (!ids.has(entry.id)) ids.set(entry.id, file.path);
        }
    }
    const context: ICheckContext = {ids, packages: new Set(packageAreas(root))};

    const problems = docs.flatMap(doc => checkDoc(doc, context));
    if (!flags.has('no-spell')) problems.push(...(await spellProblems(root, docs)));

    const errors = problems.filter(problem => problem.severity === 'error');
    const warnings = problems.filter(problem => problem.severity === 'warning');

    if (flags.has('json')) {
        process.stdout.write(`${JSON.stringify(problems, null, 2)}\n`);
    } else {
        for (const problem of problems) {
            const stream = problem.severity === 'error' ? process.stderr : process.stdout;
            stream.write(`${describeProblem(problem)}\n`);
        }
    }
    process.stdout.write(
        `# memory check: ${errors.length} error(s), ${warnings.length} warning(s) in ${docs.length} file(s)\n`,
    );
    if (errors.length > 0) process.exitCode = 1;
}

/** The root todo's `## Manual` section, created on demand just below the index. */
function manualSection(root: string): {doc: IMemoryDoc; lines: string[]} {
    const doc = ensureDoc(root, 'cross-cutting', 'todo');
    assertMigrated(doc);
    const existed = parseDoc(doc.lines).sections.some(candidate => candidate.heading === 'Manual');
    const section = ensureManualSection(doc);
    if (!existed) writeDoc(doc);
    const lines: string[] = [];
    for (let line = section.start + 1; line <= section.end; line += 1) {
        const text = doc.lines[line];
        if (text !== undefined && text.trim() !== '') lines.push(text);
    }
    return {doc, lines};
}

function manual(root: string, args: string[], flags: Set<string>): void {
    const verb = args[0] ?? 'list';
    const {doc, lines} = manualSection(root);

    if (verb === 'list') {
        if (flags.has('json')) {
            process.stdout.write(
                `${JSON.stringify(
                    lines.map(line => line.replace(/^-\s*\[.\]\s*/, '')),
                    null,
                    2,
                )}\n`,
            );
            return;
        }
        lines.forEach((line, position) =>
            process.stdout.write(`# ${position + 1}. ${line.replace(/^-\s*\[.\]\s*/, '')}\n`),
        );
        process.stdout.write(
            `# ${lines.length} manual item(s) — yours, agents leave these alone\n`,
        );
        return;
    }

    if (verb === 'add') {
        const text = args.slice(1).join(' ').trim();
        if (!text) fail('memory manual add needs the item text');
        const structure = parseDoc(doc.lines);
        const section = structure.sections.find(candidate => candidate.heading === 'Manual')!;
        doc.lines.splice(section.end + 1, 0, ...wrapText(manualItem(text), '', '  '));
        refreshIndex(doc);
        writeDoc(doc);
        process.stdout.write(`# manual: ${text}\n`);
        return;
    }

    if (verb === 'done') {
        const wanted = args.slice(1).join(' ').trim();
        if (!wanted) fail('memory manual done needs an item number or text');
        const position = Number(wanted);
        const index =
            Number.isInteger(position) && position > 0
                ? position - 1
                : lines.findIndex(line => line.toLowerCase().includes(wanted.toLowerCase()));
        if (index < 0 || index >= lines.length) fail(`no manual item matches "${wanted}"`);
        const target = lines[index]!;
        doc.lines.splice(doc.lines.indexOf(target), 1);
        refreshIndex(doc);
        writeDoc(doc);
        process.stdout.write(`# manual: done — ${target}\n`);
        return;
    }

    fail(`unknown manual verb "${verb}"`);
}

/** Days between an ISO date and today. */
function daysSince(date: string): number {
    const then = Date.parse(`${date}T00:00:00Z`);
    return Number.isFinite(then) ? Math.round((Date.now() - then) / 86_400_000) : 0;
}

/**
 * Create a batch of authored entries from JSON files.
 *
 * The batch is authored outside the CLI (by a person or an agent) but written by
 * it, so the format, the ids and the generated index stay the CLI's business.
 * Nothing is written unless every entry is valid, and nothing is written at all
 * without `--apply` — a batch is reviewed before it lands.
 */
function importBatch(
    root: string,
    files: readonly string[],
    options: Options,
    flags: Set<string>,
): void {
    if (files.length === 0) fail('memory import <file.json> [<file2.json> ...] [--apply]');

    const kind = options.get('kind') ? (kindOf(options.get('kind')!) ?? undefined) : undefined;
    if (options.get('kind') && !kind) fail(`unknown kind "${options.get('kind')}"`);

    const plans = files.map(file => {
        const path = resolve(file.trim());
        if (!existsSync(path)) fail(`no such batch file: ${path}`);
        return parseImport(relative(root, path), readFileSync(path, 'utf8'), {
            kind,
            defaultArea: options.get('area')?.trim(),
            defaultStatus: options.get('status')?.trim(),
            today: today(),
            source: relative(root, path),
        });
    });
    const plan = mergePlans(plans);

    for (const note of plan.notes) process.stdout.write(`# note: ${note}\n`);
    for (const problem of plan.problems) process.stderr.write(`blong-dev: ${problem}\n`);
    if (plan.problems.length > 0) {
        const noun = plan.entries.length === 1 ? 'entry' : 'entries';
        process.stdout.write(
            `\n# import: ${plan.problems.length} problem(s); ${plan.entries.length} valid ${noun} — nothing written\n`,
        );
        process.exitCode = 1;
        return;
    }

    const areas = new Set(plan.entries.map(entry => entry.area));
    const unknown = [...areas].filter(area => !isKnownArea(root, area));
    if (unknown.length > 0) {
        for (const area of unknown) {
            process.stderr.write(
                `blong-dev: unknown area "${area}" — use a package folder or a reserved area\n`,
            );
        }
        process.exitCode = 1;
        return;
    }

    const files_ = new Set(plan.entries.map(entry => memoryFile(root, entry.area, plan.kind)));
    const noun = plan.entries.length === 1 ? 'entry' : 'entries';

    // Refuse a batch that is already written: applying one twice duplicates every
    // entry it holds, and only `memory audit` notices afterwards.
    if (!flags.has('force')) {
        const existing = [...files_].flatMap(file => {
            if (!existsSync(file)) return [];
            const {kind, scope} = describeFile(root, file)!;
            return parseDoc(readDoc(file, kind, scope).lines).entries.map(entry => ({
                id: entry.id,
                title: entry.title,
                body: entry.body.join(' '),
            }));
        });
        const duplicates = duplicateEntries(plan.entries, existing);
        for (const duplicate of duplicates) process.stderr.write(`blong-dev: ${duplicate}\n`);
        if (duplicates.length > 0) {
            process.stdout.write(
                `\n# import: ${duplicates.length} ${duplicates.length === 1 ? 'entry is' : 'entries are'} ` +
                    `already written — pass --force to import anyway\n`,
            );
            process.exitCode = 1;
            return;
        }
    }

    if (!flags.has('apply')) {
        for (const entry of plan.entries) {
            process.stdout.write(
                `# ${entry.date} ${entry.status.padEnd(10)} ${entry.area}  ${entry.title}\n`,
            );
        }
        process.stdout.write(
            `\n# import: ${plan.entries.length} ${plan.kind} ${noun} → ${files_.size} file(s), ` +
                `${plan.manual.length} manual item(s)\n# dry run — pass --apply to write\n`,
        );
        return;
    }

    const applied = applyEntries(root, plan.kind, plan.entries, plan.manual);
    for (const entry of applied) {
        process.stdout.write(`# ${entry.id.padEnd(6)} ${entry.area}  ${entry.title}\n`);
    }
    if (plan.manual.length > 0 && plan.kind === 'todo')
        files_.add(memoryFile(root, 'cross-cutting', 'todo'));
    process.stdout.write(
        `# import: ${applied.length} ${plan.kind} ${noun} → ${files_.size} file(s), ` +
            `${plan.manual.length} manual item(s) written\n`,
    );
}

/**
 * Author date per line of a file, from git blame.
 *
 * Legacy entries carry no date, and stamping them all with the migration date
 * would lose the history the stale-entry audit depends on. A file outside a
 * checkout simply yields no dates.
 */
function blameDates(root: string, path: string): Map<number, string> {
    try {
        const text = execFileSync(
            'git',
            ['blame', '--date=short', '--line-porcelain', '--', relative(root, path)],
            {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']},
        );
        return parseBlameDates(text);
    } catch {
        return new Map();
    }
}

/**
 * Convert a legacy file into entries.
 *
 * Prints the plan by default; `--apply` writes it. This is the one command
 * allowed to write a file that is not in the memory format yet, because
 * converting those files is exactly its job — and `--drop <file>` takes the
 * reviewed prune list so deletions stay a deliberate act.
 */
function migrate(root: string, args: string[], options: Options, flags: Set<string>): void {
    const source = args[0];
    if (!source)
        fail(
            'memory migrate <file> --kind <kind> [--default-area <area>] [--drop <file>] [--apply]',
        );
    const path = resolve(source);
    if (!existsSync(path)) fail(`no such file: ${path}`);
    const kind = options.get('kind') ? kindOf(options.get('kind')) : null;
    if (!kind) fail('memory migrate needs --kind friction|todo|decision');

    const described = describeFile(root, path);
    const scope = described?.scope ?? 'root';
    const dropFile = options.get('drop');
    const dropped = dropFile
        ? parseDropList(readFileSync(resolve(dropFile), 'utf8'))
        : new Set<number>();

    const result = migrateLegacy(splitLines(readFileSync(path, 'utf8')), {
        kind,
        defaultArea: options.get('default-area') ?? (scope === 'root' ? 'cross-cutting' : scope),
        defaultDate: options.get('date') ?? today(),
        drop: dropped,
        dates: flags.has('no-blame') ? undefined : blameDates(root, path),
        resolvePackage: name => projectFolderForName(root, name),
        resolveArea: candidate =>
            isKnownArea(root, candidate)
                ? candidate
                : projectFolderForName(root, candidate.split('/').pop() ?? candidate),
        resolveTopic: topic => {
            const text = topic.toLowerCase();
            // Longest key first, so `wood theme design-match` wins over `wood theme`.
            for (const key of Object.keys(TOPIC_AREAS).sort((a, b) => b.length - a.length)) {
                if (text.includes(key)) return TOPIC_AREAS[key] ?? null;
            }
            return projectFolderForName(root, text.split(' ').pop() ?? text);
        },
    });

    if (flags.has('json')) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
        let area = '';
        for (const entry of result.entries) {
            if (entry.area !== area) {
                area = entry.area;
                process.stdout.write(`\n# ${area}\n`);
            }
            process.stdout.write(
                `# ${String(entry.from).padStart(4)}-${String(entry.to).padEnd(4)} ${entry.status.padEnd(10)} ` +
                    `${entry.date}  ${entry.title}  [${entry.areaSource}]\n`,
            );
        }
        for (const item of result.dropped) {
            process.stdout.write(`\n# dropped ${item.from}-${item.to}  ${item.title}\n`);
        }
        const areas = new Set(result.entries.map(entry => entry.area));
        process.stdout.write(
            `\n# migrate: ${result.entries.length} entries → ${areas.size} file(s), ` +
                `${result.dropped.length} dropped, ${result.manual.length} manual item(s)\n`,
        );
        for (const note of result.notes) process.stdout.write(`# note: ${note}\n`);
    }

    if (!flags.has('apply')) {
        process.stdout.write('# dry run — pass --apply to write\n');
        return;
    }

    // Group by target FILE, not by area: several areas can share one file — every
    // root area (`cross-cutting`, `ci`, …) lives in the same root document, so
    // writing per area would overwrite the previous batch.
    const byFile = new Map<
        string,
        {area: string; scope: string; rewritesSource: boolean; entries: typeof result.entries}
    >();
    for (const entry of result.entries) {
        const file = memoryFile(root, entry.area, kind);
        const bucket = byFile.get(file) ?? {
            area: entry.area,
            scope: scopeOf(entry.area),
            rewritesSource: file === path,
            entries: [],
        };
        bucket.entries.push(entry);
        byFile.set(file, bucket);
    }

    let counter = highestId(root, kind);
    const written: string[] = [];
    for (const [file, bucket] of byFile) {
        const doc: IMemoryDoc = bucket.rewritesSource
            ? {path: file, kind, scope: bucket.scope, lines: skeleton(kind, bucket.scope)}
            : ensureDoc(root, bucket.area, kind);
        if (!bucket.rewritesSource) assertMigrated(doc);
        for (const entry of bucket.entries) {
            counter += 1;
            insertEntry(
                doc,
                sectionForStatus(entry.status),
                entryLines(
                    formatId(kind, counter),
                    entry.title,
                    {date: entry.date, area: entry.area, status: entry.status},
                    formatLines(entry.body),
                ),
            );
        }
        if (bucket.rewritesSource) addManualItems(doc, result.manual);
        refreshIndex(doc);
        writeDoc(doc);
        written.push(`${relative(root, doc.path)} (${bucket.entries.length})`);
    }
    process.stdout.write(`# migrated ${written.join(', ')}\n`);
    if (
        result.manual.length > 0 &&
        !written.some(entry => entry.startsWith(relative(root, path)))
    ) {
        process.stdout.write(
            `# ${result.manual.length} manual item(s) were not written: pass them with \`memory manual add\`\n`,
        );
    }
}

/** Remove entries by id, for a reviewed prune. */
function prune(root: string, args: string[], options: Options, flags: Set<string>): void {
    const reason = options.get('reason');
    if (!reason)
        fail('memory prune <id,id,...> --reason "<why>" (the reason is recorded nowhere else)');
    const ids = args
        .flatMap(arg => arg.split(','))
        .map(id => id.trim().toUpperCase())
        .filter(Boolean);
    if (ids.length === 0) fail('memory prune needs at least one id');

    const removed: string[] = [];
    for (const id of ids) {
        const found = findEntry(root, id);
        if (!found) fail(`no entry with id ${id}`);
        assertMigrated(found.doc);
        removeEntry(found.doc, found.entry);
        refreshIndex(found.doc);
        writeDoc(found.doc);
        removed.push(`${id} ${found.entry.title}`);
    }

    if (flags.has('json')) {
        process.stdout.write(`${JSON.stringify({reason, removed}, null, 2)}\n`);
        return;
    }
    for (const item of removed) process.stdout.write(`# pruned ${item}\n`);
    process.stdout.write(`# ${removed.length} entries pruned — ${reason}\n`);
}

function audit(root: string, options: Options, flags: Set<string>): void {
    const docs = docsOf(root, options);
    const entries = docs.flatMap(doc => parseDoc(doc.lines).entries.map(entry => ({doc, entry})));
    const known = new Set(
        listMemoryFiles(root).flatMap(file =>
            parseDoc(readDoc(file.path, file.kind, file.scope).lines).entries.map(
                entry => entry.id,
            ),
        ),
    );

    const dangling: Array<{file: string; line: number; id: string}> = [];
    for (const doc of docs) {
        doc.lines.forEach((line, index) => {
            if (ENTRY_HEADING.test(line)) return;
            for (const match of line.matchAll(/\b[FTD]-\d{3}\b/g)) {
                if (!known.has(match[0]))
                    dangling.push({file: relative(root, doc.path), line: index + 1, id: match[0]});
            }
        });
    }

    const titles = new Map<string, string[]>();
    for (const {entry} of entries) {
        const key = entry.title.toLowerCase();
        titles.set(key, [...(titles.get(key) ?? []), entry.id]);
    }
    const duplicates = Array.from(titles.entries()).filter(([, ids]) => ids.length > 1);
    const stale = entries
        .filter(({entry}) => entry.meta?.status === 'open' && daysSince(entry.meta.date) > 90)
        .map(({entry}) => ({id: entry.id, date: entry.meta!.date, title: entry.title}));

    if (flags.has('json')) {
        process.stdout.write(`${JSON.stringify({dangling, duplicates, stale}, null, 2)}\n`);
        return;
    }
    for (const item of dangling) {
        process.stdout.write(`# ${item.file}:${item.line} references missing ${item.id}\n`);
    }
    for (const [title, ids] of duplicates) {
        process.stdout.write(`# duplicate title "${title}" — ${ids.join(', ')}\n`);
    }
    for (const item of stale) {
        process.stdout.write(
            `# ${item.id} open for ${daysSince(item.date)} days — ${item.title}\n`,
        );
    }
    process.stdout.write(
        `# memory audit: ${dangling.length} dangling reference(s), ${duplicates.length} duplicate title(s), ` +
            `${stale.length} open older than 90 days\n`,
    );
}

export async function memory(args: string[]): Promise<void> {
    const {positionals, options, flags} = parseArgs(args);
    const root = repoRoot(process.cwd());
    const [verb, ...rest] = positionals;

    // `check`, `index` and `format` take the files they work on positionally as
    // well as through `--files`, which is how the pre-commit hook calls them.
    if ((verb === 'check' || verb === 'index' || verb === 'format') && rest.length > 0) {
        options.set('files', [...rest, options.get('files')].filter(Boolean).join(','));
    }

    try {
        switch (verb) {
            case 'add':
                return await add(root, positionals.slice(1), options);
            case 'list':
                return list(root, options, flags);
            case 'show':
                return show(root, positionals[1], flags);
            case 'edit':
                return edit(root, positionals[1], options);
            case 'close':
                return close(root, positionals[1], options, flags);
            case 'reopen':
                return reopen(root, positionals[1]);
            case 'move':
                return move(root, positionals[1], options);
            case 'index':
                return index(root, options, flags);
            case 'format':
                return format(root, options, flags);
            case 'check':
                return await check(root, options, flags);
            case 'manual':
                return manual(root, rest, flags);
            case 'audit':
                return audit(root, options, flags);
            case 'migrate':
                return migrate(root, rest, options, flags);
            case 'import':
                return importBatch(root, positionals.slice(1), options, flags);
            case 'prune':
                return prune(root, rest, options, flags);
            default:
                process.stderr.write(`blong-dev: unknown memory verb "${verb ?? ''}"\n${USAGE}\n`);
                process.exitCode = 1;
        }
    } catch (error) {
        // Usage errors already printed their message; anything else is a bug.
        if (!(error instanceof UsageError)) throw error;
    }
}
