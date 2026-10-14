/**
 * `blong-dev memory` — the writer and validator of the agent memory files.
 *
 * Agents never hand-edit these files: the command owns the ids, the section an
 * entry belongs in, the wrapping and the generated index, so the format stays
 * consistent without anyone remembering it. `check` is the gate (also wired into
 * the staged-file lint), `list --json` and `show` are how an agent reads them
 * without loading a whole file.
 *
 * Every write also pushes the entry it touched into a Hindsight bank, which is what
 * `search` reads, and `prune` takes the entry out again. The markdown stays the
 * source of truth — the index is derived and disposable — so an unreachable
 * server costs a warning and nothing else, and `index --semantic` rebuilds.
 *
 * Ids are allocated per file, so a bare id can name an entry in the repository root
 * and a different one in a package. A bare id held by several files resolves to the
 * package the command is run from; anywhere else it is refused with the list of
 * files that hold it, and qualifying the id (`id@<scope>`, a project folder or
 * `root`) names one of them. See `memoryResolve.ts` for why the root scope is not a
 * fallback.
 *
 * Usage:
 *   blong-dev memory add <friction|todo|decision> --title <title> [--area <area>]
 *                        [--body <text> | --body-file <file>] [--status <status>] [--id <id>]
 *   blong-dev memory list [--kind <kind>] [--area <area>] [--status <status>] [--search <text>] [--json]
 *   blong-dev memory show <id|id@scope> [--json]
 *   blong-dev memory close <id|id@scope> [--note <text>] [--by <id>] [--reason <text>]
 *   blong-dev memory retire <id|id@scope> [--reason <text>] [--purge]
 *   blong-dev memory reopen <id|id@scope>
 *   blong-dev memory move <id|id@scope> --area <area>
 *   blong-dev memory index [--check] [--files a.md,b.md] [--semantic] [--dry-run]
 *                        [--sources entry,docs,skill] [--stats] [--prune]
 *   blong-dev memory search <query> [--source entry|docs|skill] [--kind <kind>] [--area <area>]
 *                             [--status <status>] [--limit <n>] [--json]
 *   blong-dev memory format [--check] [--files a.md,b.md]
 *   blong-dev memory check [--files a.md,b.md] [--json] [--no-spell]
 *   blong-dev memory manual <list|add <text>|done <n|text>>
 *   blong-dev memory audit [--json]
 *   blong-dev memory migrate <file> --kind <kind> [--drop <file>] [--apply]
 *   blong-dev memory prune <id|id@scope,id|id@scope> --reason "<why>"
 */

import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {join, relative, resolve} from 'node:path';

import {
    areaTag,
    entryDocument,
    entryDocuments,
    kindTag,
    statusTag,
    tagValue,
    type IHindsightDocument,
} from '../memory/hindsight/hindsightDocument.ts';
import {formatSearchResults} from '../memory/hindsight/hindsightOutput.ts';
import {pageDocuments, type IPageSource} from '../memory/hindsight/hindsightPage.ts';
import {resolveHindsight} from '../memory/hindsight/hindsightRuntime.ts';
import {
    SOURCE_TAG,
    discoverPages,
    pageSourceOf,
    parseSources,
    sourceTags,
    type MemorySource,
} from '../memory/hindsight/hindsightSources.ts';
import {
    BACKFILL_BATCH_SIZE,
    BACKFILL_TIMEOUT_MS,
    type IHindsightDocumentRef,
    type IHindsightStore,
} from '../memory/hindsight/hindsightStore.ts';
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
    clearRetired,
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
    retireEntry,
    sectionForStatus,
    skeleton,
    writeDoc,
} from '../memory/memoryEdit.ts';
import {formatLines, renderLines, wrapText} from '../memory/memoryFormat.ts';
import {duplicateEntries, mergePlans, parseImport} from '../memory/memoryImport.ts';
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
    buildReferenceIndex,
    nearestAnchor,
    referenceSites,
    scanSites,
    trackedFiles,
    type ReferenceTarget,
} from '../memory/memoryReference.ts';
import {parseId, resolveId, scopeForCwd, type IIdHit} from '../memory/memoryResolve.ts';
import {
    DEFAULT_STATUS,
    ENTRY_HEADING,
    KIND_PREFIX,
    KIND_STATUSES,
    LEDGER_LINE,
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
    'blong-dev memory show <id|id@scope> [--json]',
    'blong-dev memory edit <id|id@scope> [--title <title>] [--body <text>|--body-file <file>] [--status <status>]',
    'blong-dev memory close <id|id@scope> [--note <text>] [--by <id>] [--reason <text>]',
    'blong-dev memory retire <id|id@scope> [--reason <text>] [--purge]',
    'blong-dev memory renumber <id|id@scope> --to <id>',
    'blong-dev memory comply [--since <ref>] [--json]',
    'blong-dev memory reopen <id|id@scope>',
    'blong-dev memory move <id> --area <area>',
    'blong-dev memory index|format|check [--files a.md,b.md]',
    'blong-dev memory index --semantic [--sources entry,docs,skill] [--dry-run] [--stats] [--prune]',
    'blong-dev memory search <query> [--source entry|docs|skill] [--kind <kind>] [--area <area>] [--limit <n>] [--json]',
    'blong-dev memory manual <list|add <text>|done <n|text>>',
    'blong-dev memory audit [--json]',
    'blong-dev memory refs [<id|doc:page|skill:name>…] [--dangling] [--sites] [--changed] [--fix-anchors] [--fix-superseded] [--summary] [--json]',
    'blong-dev memory export [--out <file>]',
    'blong-dev memory migrate <file> --kind <kind> [--default-area <area>] [--drop <file>] [--apply]',
    'blong-dev memory import <file.json> [...] [--kind <kind>] [--apply] [--force]',
    'blong-dev memory prune <id,id> --reason "<why>" [--force] [--purge]',
].join('\n');

/** Results a search prints unless `--limit` says otherwise. */
const DEFAULT_SEARCH_LIMIT = 8;

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

/** An id's place, with the document it was read from. */
interface IEntryHit extends IIdHit {
    doc: IMemoryDoc;
}

/** Every place an id is written, in search order (root scope first). */
function entriesWithId(root: string, wanted: string): IEntryHit[] {
    const hits: IEntryHit[] = [];
    for (const file of listMemoryFiles(root)) {
        const doc = readDoc(file.path, file.kind, file.scope);
        for (const entry of parseDoc(doc.lines).entries) {
            if (entry.id === wanted) hits.push({file, entry, doc});
        }
    }
    return hits;
}

/** One line of an ambiguity report: the file that holds the id and the entry's title. */
function describeHit(root: string, hit: IIdHit): string {
    return `${relative(root, hit.file.path)} — ${hit.entry.title}`;
}

/**
 * Find an entry by id across every memory file, refusing an ambiguous answer.
 *
 * A bare id can be held by several files, because the counter runs per file. The
 * package the command is run from wins; anything else is refused with the list of
 * files that hold the id, so the caller qualifies it (`<id>@<scope>`) instead of an
 * edit landing on whichever file came first.
 */
function findEntry(root: string, id: string): {doc: IMemoryDoc; entry: IMemoryEntry} | null {
    const parsed = parseId(id);
    const resolution = resolveId(
        parsed,
        entriesWithId(root, parsed.id),
        scopeForCwd(process.cwd(), root, ['root', ...packageAreas(root)]),
    );
    if (resolution.how === 'missing') return null;
    if (resolution.how === 'scope-miss') {
        const where =
            resolution.hits.length === 0
                ? 'no file holds it'
                : `it is in ${resolution.hits
                      .map(hit => `${hit.file.scope} (${relative(root, hit.file.path)})`)
                      .join(', ')}`;
        fail(`no entry with id ${parsed.id} in scope ${resolution.scope} — ${where}`);
    }
    if (resolution.how === 'ambiguous') {
        fail(
            `${id} names ${resolution.hits.length} entries — qualify it with the scope: ` +
                resolution.hits
                    .map(hit => `${parsed.id}@${hit.file.scope} (${describeHit(root, hit)})`)
                    .join(', '),
        );
    }
    const hit = resolution.hit as IEntryHit;
    return {doc: hit.doc, entry: hit.entry};
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
 * Push entries a write has just changed into the semantic index.
 *
 * The file on disk is the source of truth and the index is derived, so nothing
 * here may fail the command: an unreachable server is reported once on stderr and
 * the next `memory index --semantic` repairs whatever was missed. Entries are
 * re-read from the document rather than passed in, because the lines are the only
 * description of an entry that survives a write.
 */
async function ingest(
    root: string,
    touched: ReadonlyArray<{doc: IMemoryDoc; id: string}>,
): Promise<void> {
    const {store} = resolveHindsight();
    if (!store || touched.length === 0) return;

    const documents = touched
        .map(({doc, id}) => {
            const entry = parseDoc(doc.lines).entries.find(candidate => candidate.id === id);
            return entry ? entryDocument(root, doc, entry) : null;
        })
        .filter((document): document is IHindsightDocument => document !== null);

    const outcome = await store.retain(documents);
    if (!outcome.ok) warnIndex(store, outcome.reason);
}

/** Drop documents whose entries are gone from disk, so a search cannot find them. */
async function forget(ids: readonly string[]): Promise<void> {
    const {store} = resolveHindsight();
    if (!store || ids.length === 0) return;
    const outcome = await store.remove(ids);
    if (!outcome.ok) warnIndex(store, outcome.reason);
}

/** Report a skipped index update without failing the command that made it. */
function warnIndex(store: IHindsightStore, reason: string): void {
    process.stderr.write(`blong-dev: hindsight index skipped (${store.url}): ${reason}\n`);
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
    // An explicit id may be one the ledger holds as retired — an entry a `close`
    // reduced to a ledger line, being put back with a body recovered from elsewhere.
    // `check` rejects an id that is both an entry and a retired id, so the line goes
    // with it; the fate it recorded is reported so the caller sees what it replaced.
    if (options.get('id')) {
        const previous = clearRetired(doc, id);
        if (previous) process.stdout.write(`# ${id} taken back from the ledger — ${previous}\n`);
    }
    insertEntry(
        doc,
        SECTION_FOR_STATUS[status] ?? 'Open',
        entryLines(id, title, {date, area, status}, body),
    );
    refreshIndex(doc);
    writeDoc(doc);

    process.stdout.write(`# ${id} ${status} · ${area}\n`);
    process.stdout.write(`# ${relative(root, doc.path)}\n`);
    await ingest(root, [{doc, id}]);
}

/**
 * Correct an entry that is already written.
 *
 * The body is the part that usually needs fixing (a checker finding, a wording
 * that reads badly), and rewriting it by hand would break the format the CLI
 * owns, so the entry is re-rendered from its parsed parts.
 */
async function edit(root: string, id: string | undefined, options: Options): Promise<void> {
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
    await ingest(root, [{doc, id: entry.id}]);
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

/**
 * Give an entry its terminal status, keeping it.
 *
 * The reasoning outlives the status, so the entry stays: a friction is `resolved`, a
 * todo is `done`, a decision is `superseded` by the `--by`/`--reason` it names, and
 * `--note` says what the outcome was. An entry that should not be in the files at all
 * is `retire`d instead, which removes it and leaves only its id in the ledger.
 */
async function close(root: string, id: string | undefined, options: Options): Promise<void> {
    if (!id) fail('memory close needs an id');
    const found = findEntry(root, id);
    if (!found) fail(`no entry with id ${id}`);
    const {doc, entry} = found;
    const note = options.get('note');
    assertMigrated(doc);

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
    await ingest(root, [{doc, id: entry.id}]);
}

/**
 * Take an entry out of the files, leaving its id in the ledger.
 *
 * Where `close` keeps the entry under its terminal status, retiring removes it: the
 * entry never belonged — a duplicate, a mis-filing, work that was cancelled — so there
 * is no record worth keeping. The number is not freed: the `## Retired` line keeps it,
 * so a reference that outlives the entry is a warning naming its fate rather than a
 * dangling mystery or a silent pointer at a later entry that took the number. `--purge`
 * drops the line too and frees the number, for something that never belonged in a
 * reviewable form at all.
 */
async function retire(
    root: string,
    id: string | undefined,
    options: Options,
    flags: Set<string>,
): Promise<void> {
    if (!id) fail('memory retire needs an id');
    const found = findEntry(root, id);
    if (!found) fail(`no entry with id ${id}`);
    const {doc, entry} = found;
    assertMigrated(doc);
    const reason = options.get('reason')?.trim();
    const fate = `retired ${today()}${reason ? ` — ${reason}` : ''}`;

    removeEntry(doc, entry);
    if (flags.has('purge')) {
        process.stdout.write(`# ${entry.id} retired and purged — the number is free again\n`);
    } else {
        retireEntry(doc, entry.id, fate);
        process.stdout.write(`# ${entry.id} retired — ${fate}\n`);
    }
    refreshIndex(doc);
    writeDoc(doc);
    process.stdout.write(`# ${entry.title}\n`);
    await forget([entry.id]);
}

/** The paragraph `close` writes when a decision is superseded by another. */
const SUPERSEDED_BY = /^Superseded by `[A-Z]-\d{3}`\.$/;

/**
 * Drop the machine-written supersession line from a body.
 *
 * Reopening a decision used to leave `Superseded by ...` behind, so an active entry
 * kept pointing at a choice that no longer replaced it. Only the line `close` writes
 * itself is removed: everything else in a body is prose an author wrote, and deleting
 * that silently would lose more than it fixes — a `--note` about a fix that later
 * regressed is worth keeping.
 */
function withoutSupersession(body: readonly string[]): string[] {
    const kept: string[] = [];
    for (const line of body) {
        if (SUPERSEDED_BY.test(line.trim())) {
            // The line arrived as its own paragraph, so its blank separator goes too.
            if (kept.length > 0 && kept[kept.length - 1]!.trim() === '') kept.pop();
            continue;
        }
        kept.push(line);
    }
    return kept;
}

async function reopen(root: string, id: string | undefined): Promise<void> {
    if (!id) fail('memory reopen needs an id');
    const found = findEntry(root, id);
    if (!found) fail(`no entry with id ${id}`);
    const {doc, entry} = found;
    assertMigrated(doc);
    const status = doc.kind === 'decision' ? 'active' : 'open';
    const body = withoutSupersession(entry.body);
    setStatus(doc, entry, status, body);
    process.stdout.write(`# ${entry.id} ${status}\n`);
    if (body.length !== entry.body.length) {
        process.stdout.write(`# ${entry.id} no longer claims a successor\n`);
    }
    await ingest(root, [{doc, id: entry.id}]);
}

async function move(root: string, id: string | undefined, options: Options): Promise<void> {
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
        await ingest(root, [{doc, id: entry.id}]);
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
    await ingest(root, [{doc: target, id: entry.id}]);
}

/** The switches and the selection a `memory index` run was given. */
interface IIndexFlags {
    /** Report the generated index drift only; write nothing. */
    check: boolean;
    /** Also push the selected documents into the bank. */
    semantic: boolean;
    /** Report what a semantic run would send, touching nothing. */
    dryRun: boolean;
    /** List the bank documents the tree no longer holds. */
    stats: boolean;
    /** Delete the bank documents the tree no longer holds. */
    prune: boolean;
    /** The streams this run owns. */
    sources: MemorySource[];
    /**
     * The page files those streams hold.
     *
     * Discovered once, because the run both counts them and then re-reads them:
     * two walks of the tree could disagree if anything changed in between.
     */
    pages: IPageSource[];
}

/**
 * True when a valueless flag was given.
 *
 * `parseArgs` takes the token after `--flag` as its value whenever that token is
 * not another flag, so `index --prune friction.md` arrives as an option rather
 * than a flag — and a prune that silently does not happen is worse than one that
 * refuses the argument.
 */
function flagOn(flags: Set<string>, options: Options, name: string): boolean {
    return flags.has(name) || options.has(name);
}

/**
 * The page files a run owns.
 *
 * Normally the whole tree under the selected sources. A caller that names files
 * with `--files` gets exactly those, but only when the run is page-only: with
 * `entry` selected the same flag has always meant memory files, and one flag
 * cannot mean two things at once.
 */
function pagesOf(root: string, sources: readonly MemorySource[], options: Options): IPageSource[] {
    const discovered = discoverPages(root, sources);
    const named = options.get('files');
    if (!named || sources.includes('entry')) return discovered;

    const pages = named
        .split(',')
        .map(file => resolve(file.trim()))
        .map(file => pageSourceOf(root, file))
        .filter((page): page is IPageSource => page !== null);
    if (pages.length === 0) {
        fail('none of the named files is a documentation page or a skill — nothing to ingest');
    }
    return pages;
}

async function index(root: string, options: Options, flags: Set<string>): Promise<void> {
    const wanted = parseSources(options.get('sources') ?? 'entry');
    for (const problem of wanted.problems) fail(problem);

    const run: IIndexFlags = {
        check: flagOn(flags, options, 'check'),
        semantic: flagOn(flags, options, 'semantic'),
        dryRun: flagOn(flags, options, 'dry-run'),
        stats: flagOn(flags, options, 'stats'),
        prune: flagOn(flags, options, 'prune'),
        sources: wanted.sources,
        pages: pagesOf(root, wanted.sources, options),
    };
    const docs = docsOf(root, options);
    let stale = 0;
    for (const doc of docs) {
        assertMigrated(doc);
        const before = renderLines(doc.lines);
        refreshIndex(doc);
        const after = renderLines(doc.lines);
        if (before !== after) stale += 1;
        if (!run.check) writeDoc(doc);
    }
    process.stdout.write(
        run.check
            ? `# memory index: ${stale} of ${docs.length} file(s) out of date\n`
            : `# memory index: ${docs.length} file(s), ${stale} updated\n`,
    );
    if (run.check && stale > 0) process.exitCode = 1;
    if (run.semantic) await backfill(root, docs, run);
}

/**
 * Push every entry of the selected files into the semantic index, in batches.
 *
 * This is the repair path as much as the first-time one: documents are keyed by
 * entry id, so a second run replaces what is there rather than doubling it, and
 * anything a write could not reach earlier is picked up now. `--dry-run` reports
 * the size of the job without touching the server, and the run finishes by
 * comparing the bank with the tree (see {@link reconcile}).
 */
async function backfill(
    root: string,
    docs: readonly IMemoryDoc[],
    run: IIndexFlags,
): Promise<void> {
    const entries = run.sources.includes('entry') ? entryDocuments(root, docs) : [];
    const documents = [...entries, ...pageDocuments(root, run.pages)];

    if (run.dryRun) {
        const breakdown = [
            ...(run.sources.includes('entry') ? [`${entries.length} entries`] : []),
            ...(run.sources.includes('docs')
                ? [`${pageCount(run, 'docs')} documentation pages`]
                : []),
            ...(run.sources.includes('skill') ? [`${pageCount(run, 'skill')} skills`] : []),
        ].join(', ');
        process.stdout.write(
            `# memory index --semantic: would ingest ${documents.length} document(s) — ` +
                `${breakdown}\n`,
        );
        return;
    }

    const {config, store} = resolveHindsight();
    if (!store) {
        process.stderr.write(
            '# memory index --semantic: the semantic index is switched off (HINDSIGHT_DISABLED)\n',
        );
        process.exitCode = 1;
        return;
    }

    let ingested = 0;
    for (let start = 0; start < documents.length; start += BACKFILL_BATCH_SIZE) {
        const batch = documents.slice(start, start + BACKFILL_BATCH_SIZE);
        // Waiting is the point of a backfill: the coverage check that follows reads
        // the bank, and a queued batch would not be in it yet.
        const outcome = await store.retain(batch, {
            wait: true,
            timeoutMs: BACKFILL_TIMEOUT_MS,
        });
        if (!outcome.ok) {
            warnIndex(store, outcome.reason);
            break;
        }
        ingested += batch.length;
        process.stdout.write(`# indexed ${ingested}/${documents.length}\n`);
    }

    const missed = documents.length - ingested;
    process.stdout.write(
        `# memory index --semantic: ${ingested} of ${documents.length} document(s) ingested, ` +
            `${missed} not — bank ${config.bank} at ${config.url}\n`,
    );
    if (missed > 0) process.exitCode = 1;

    await reconcile(store, documents, run);
}

/** How many of a run's pages belong to one stream. */
function pageCount(run: IIndexFlags, kind: 'docs' | 'skill'): number {
    return run.pages.filter(page => page.kind === kind).length;
}

/**
 * Compare the bank with the tree, and optionally repair the difference.
 *
 * What the backfill sent says nothing about what the bank holds: an index covering
 * a fraction of the tree looks exactly like a complete one, and the observation
 * that produced this step was a bank reporting 54 documents while the tree held
 * 591. Reading the bank's own listing closes that gap and is the only way to notice
 * a document whose entry vanished — a hand edit, a checkout of an older branch, a
 * file deleted wholesale — because nothing calls `forget` for those.
 */
async function reconcile(
    store: IHindsightStore,
    documents: readonly IHindsightDocument[],
    run: IIndexFlags,
): Promise<void> {
    const listing = await store.list();
    if (!listing.ok) {
        warnIndex(store, listing.reason);
        // A repair the caller asked for and did not get is a failure; a count that
        // could not be read is only a report, and the ingest line already stands.
        if (run.prune) process.exitCode = 1;
        return;
    }

    const tags = sourceTags(run.sources);
    const owned = listing.documents.filter(candidate =>
        candidate.tags.some(tag => tags.includes(tag)),
    );
    const wanted = new Set(documents.map(document => document.documentId));
    const orphaned = owned.filter(candidate => !wanted.has(candidate.id));
    const present = new Set(owned.map(candidate => candidate.id));
    const missing = documents.filter(document => !present.has(document.documentId));

    const drift: string[] = [];
    if (orphaned.length > 0) drift.push(`${orphaned.length} in the bank but not the tree`);
    if (missing.length > 0) drift.push(`${missing.length} in the tree but not the bank`);
    process.stdout.write(
        `# memory index --semantic: bank holds ${owned.length} document(s) of this source, ` +
            `tree holds ${documents.length}` +
            (drift.length > 0 ? ` — ${drift.join(', ')}\n` : '\n'),
    );

    if (run.stats) {
        printIds(
            'stale',
            orphaned.map(orphan => describeOrphan(orphan)),
        );
        printIds(
            'not in the bank',
            missing.map(document => document.documentId),
        );
    }

    if (!run.prune) return;

    if (orphaned.length === 0) {
        process.stdout.write('# memory index --semantic: nothing to prune\n');
        return;
    }

    const outcome = await store.remove(orphaned.map(orphan => orphan.id));
    if (!outcome.ok) {
        warnIndex(store, outcome.reason);
        process.exitCode = 1;
        return;
    }
    for (const orphan of orphaned) process.stdout.write(`# pruned ${describeOrphan(orphan)}\n`);
    process.stdout.write(`# memory index --semantic: ${orphaned.length} document(s) removed\n`);
}

/** Ids a `--stats` line names before it summarises the rest. */
const STATS_SAMPLE = 20;

/** Print a list of document ids, naming at most {@link STATS_SAMPLE} of them. */
function printIds(label: string, ids: readonly string[]): void {
    if (ids.length === 0) return;
    const shown = ids.slice(0, STATS_SAMPLE).join(', ');
    const rest = ids.length > STATS_SAMPLE ? ` … and ${ids.length - STATS_SAMPLE} more` : '';
    process.stdout.write(`# ${label}: ${shown}${rest}\n`);
}

/** `F-101 (2026-09-15, friction)` — enough to tell which document is meant. */
function describeOrphan(orphan: IHindsightDocumentRef): string {
    const kind = tagValue(orphan.tags, 'kind');
    const date = orphan.updatedAt?.slice(0, 10);
    const details = [date, kind].filter((part): part is string => Boolean(part));
    return details.length > 0 ? `${orphan.id} (${details.join(', ')})` : orphan.id;
}

/**
 * Ask the semantic index what the repository already knows.
 *
 * This is a read the caller explicitly asked for, so unlike the write hook it
 * fails loudly: an unreachable server is an error naming the URL and how to start
 * it, never an empty result set that reads as "nothing matched".
 */
async function search(args: string[], options: Options, flags: Set<string>): Promise<void> {
    const query = args.join(' ').trim();
    if (!query) {
        fail(
            'memory search <query> [--kind <kind>] [--area <area>] [--status <status>] [--limit <n>] [--json]',
        );
    }

    const {config, store} = resolveHindsight();
    if (!store) {
        process.stderr.write(
            'blong-dev: the semantic index is switched off (HINDSIGHT_DISABLED)\n',
        );
        process.exitCode = 1;
        return;
    }

    const wanted = parseSources(options.get('source') ?? 'entry');
    for (const problem of wanted.problems) fail(problem);

    const kind = options.get('kind') ? kindOf(options.get('kind')) : null;
    if (options.get('kind') && !kind) fail(`unknown kind "${options.get('kind')}"`);

    const area = options.get('area')?.trim();
    const status = options.get('status')?.trim();

    // Kind, area and status are dimensions of an entry. Asking for them beside a
    // page source would silently exclude every page, whose tags do not carry them,
    // so the combination is refused rather than answered with an empty set.
    if (wanted.sources.some(source => source !== 'entry') && (kind || area || status)) {
        fail(
            '--kind, --area and --status describe entries — drop them, or search the entries ' +
                'with the default --source entry',
        );
    }

    const dimensions = [
        ...(kind ? [kindTag(kind)] : []),
        ...(area ? [areaTag(area)] : []),
        ...(status ? [statusTag(status)] : []),
    ];

    // One source keeps the flat form, which is what the server has always been
    // given. Several sources need a group tree: their tags are alternatives, and a
    // flat list is an AND — which would match nothing at all.
    const filter =
        wanted.sources.length === 1
            ? {tags: [SOURCE_TAG[wanted.sources[0]!], ...dimensions]}
            : {
                  tagGroups: [
                      {or: wanted.sources.map(source => ({tags: [SOURCE_TAG[source]]}))},
                      ...dimensions.map(tag => ({tags: [tag]})),
                  ],
              };

    const rawLimit = options.get('limit')?.trim();
    const limit = rawLimit === undefined ? DEFAULT_SEARCH_LIMIT : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1) {
        fail(`--limit must be a positive integer, not "${rawLimit}"`);
    }

    const outcome = await store.recall(query, {...filter, limit});
    if (!outcome.ok) {
        process.stderr.write(
            `blong-dev: cannot reach the Hindsight index at ${config.url} — ${outcome.reason}\n` +
                'blong-dev: start it with plans/memory-index/hindsight.sh\n',
        );
        process.exitCode = 1;
        return;
    }

    if (flags.has('json')) {
        process.stdout.write(
            `${JSON.stringify(
                {query, bank: config.bank, url: config.url, results: outcome.hits},
                null,
                2,
            )}\n`,
        );
        return;
    }

    const lines = formatSearchResults(outcome.hits, query, {
        bank: config.bank,
        url: config.url,
    });
    process.stdout.write(`${lines.join('\n')}\n`);
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

    const problems: IProblem[] = docs.flatMap(doc => checkDoc(doc, context));
    if (flagOn(flags, options, 'refs')) problems.push(...referenceProblems(root, options));
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

/**
 * Give an entry a new id, and record the old one as retired.
 *
 * This is the repair for a collision — two files holding the same id — and for a note
 * filed under the wrong kind. The old number stays in the ledger pointing at the new
 * entry, so a reference that used it becomes a warning that names the successor,
 * instead of a dangling id or, worse, a later entry that took the number.
 */
async function renumber(root: string, id: string | undefined, options: Options): Promise<void> {
    if (!id) fail('memory renumber <id|id@scope> --to <id>');
    const to = options.get('to')?.trim().toUpperCase();
    if (!to || !/^[FTD]-\d{3}$/.test(to)) fail('memory renumber needs --to <F-000>-style id');
    const found = findEntry(root, id);
    if (!found) fail(`no entry with id ${id}`);
    const {doc, entry} = found;
    assertMigrated(doc);
    if (entry.id === to) {
        process.stdout.write(`# ${entry.id} already has that id\n`);
        return;
    }
    if (!to.startsWith(KIND_PREFIX[doc.kind])) {
        fail(`--to ${to} must share the kind prefix ${KIND_PREFIX[doc.kind]}-`);
    }
    if (findEntry(root, to)) fail(`${to} is already in use — pick a free number`);

    removeEntry(doc, entry);
    insertEntry(
        doc,
        SECTION_FOR_STATUS[entry.meta!.status] ?? 'Open',
        entryLines(to, entry.title, entry.meta!, entry.body),
    );
    retireEntry(doc, entry.id, `renumbered to ${to} (${today()})`);
    refreshIndex(doc);
    writeDoc(doc);
    process.stdout.write(`# ${entry.id} renumbered to ${to}\n# ${relative(root, doc.path)}\n`);
    await forget([entry.id]);
    await ingest(root, [{doc, id: to}]);
}

/** Remove entries by id, for a reviewed prune. */
async function prune(
    root: string,
    args: string[],
    options: Options,
    flags: Set<string>,
): Promise<void> {
    const reason = options.get('reason');
    if (!reason)
        fail('memory prune <id,id,...> --reason "<why>" (the reason is recorded nowhere else)');
    const ids = args
        .flatMap(arg => arg.split(','))
        .map(id => id.trim().toUpperCase())
        .filter(Boolean);
    if (ids.length === 0) fail('memory prune needs at least one id');

    const sites = referenceSites(root, trackedFiles(root));
    const removed: string[] = [];
    for (const id of ids) {
        const found = findEntry(root, id);
        if (!found) fail(`no entry with id ${id}`);
        assertMigrated(found.doc);
        const cited = sites.filter(site => site.target.kind === 'entry' && site.target.id === id);
        if (cited.length > 0 && !flags.has('force')) {
            fail(
                `${id} is cited by ${cited.length} site(s) — ${cited
                    .slice(0, 5)
                    .map(site => `${site.file}:${site.line}`)
                    .join(', ')} — retarget them, or pass --force to retire it anyway`,
            );
        }
        for (const site of cited) {
            process.stdout.write(`# retarget ${site.file}:${site.line} ${site.raw}\n`);
        }
        removeEntry(found.doc, found.entry);
        if (!flags.has('purge')) {
            retireEntry(found.doc, id, `pruned ${today()} — ${reason}`);
        }
        refreshIndex(found.doc);
        writeDoc(found.doc);
        removed.push(`${id} ${found.entry.title}`);
    }

    // The entries are gone from disk, so they must be gone from the index too:
    // a search that still returns a pruned entry is worse than one that misses it.
    await forget(ids);

    if (flags.has('json')) {
        process.stdout.write(`${JSON.stringify({reason, removed}, null, 2)}\n`);
        return;
    }
    for (const item of removed) process.stdout.write(`# pruned ${item}\n`);
    process.stdout.write(`# ${removed.length} entries pruned — ${reason}\n`);
}

/** The string a `refs <target>` argument matches against. */
function targetKey(target: ReferenceTarget): string {
    if (target.kind === 'entry') return target.id;
    if (target.kind === 'doc') {
        return `doc:${target.page}${target.anchor ? `#${target.anchor}` : ''}`;
    }
    return `skill:${target.name}${target.anchor ? `#${target.anchor}` : ''}`;
}

/**
 * True when a reference must fail the gate rather than be reported.
 *
 * A superseded decision counts as an error when it names its successor, because the fix is one
 * command (`refs --fix-superseded`); when it names none, only a reader can settle it, so it stays a
 * warning. A retired id and a resolved friction are the history the code embodies and always do.
 */
function isErrorCode(code: string, successor?: string): boolean {
    return (
        code === 'unknown' || code === 'ambiguous' || (code === 'superseded' && Boolean(successor))
    );
}

/** The package folder a scanned file belongs to, for the `--summary` ledger. */
function packageOf(file: string): string {
    const parts = file.split('/');
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : (parts[0] ?? file);
}

/**
 * How `--sites` marks a citation a reader should look at, by the state of the entry it names.
 *
 * The audit view exists because resolution is not correctness, so it shows what the resolver knows:
 * a retired id names its fate, a superseded decision names the successor its reasoning moved to (or
 * says that none is recorded), and a resolved friction or done todo is marked as the record it is.
 */
function statusNote(row: {code: string; status: string; successor?: string}): string {
    if (row.code === 'retired') return '  (retired)';
    if (row.code === 'superseded') {
        return `  (superseded${row.successor ? ` → ${row.successor}` : ', no successor named'})`;
    }
    if (row.status === 'resolved' || row.status === 'done') return `  (${row.status})`;
    return '';
}

/** True when a file is one of the three corpora, whose relative links are checked. */
function inCorpus(file: string): boolean {
    return (
        file.startsWith('docs/blong/docs/') ||
        file.startsWith('.github/skills/') ||
        file.includes('/.github/memory/') ||
        file.startsWith('.github/memory/')
    );
}

/**
 * Replace one token in one file, verifying the text is still there.
 *
 * A rewrite is the only edit `refs` makes, and it is guarded: the line and column come from a
 * snapshot taken before any other fix, so a second fix on a moved line must not land on the wrong
 * text. The check refuses rather than guessing.
 */
function rewriteToken(
    root: string,
    site: {file: string; line: number; column: number; raw: string},
    next: string,
): boolean {
    const path = join(root, site.file);
    const lines = splitLines(readFileSync(path, 'utf8'));
    const original = lines[site.line - 1];
    if (original === undefined) return false;
    if (original.slice(site.column, site.column + site.raw.length) !== site.raw) return false;
    lines[site.line - 1] =
        original.slice(0, site.column) + next + original.slice(site.column + site.raw.length);
    writeFileSync(path, `${lines.join('\n')}\n`);
    return true;
}

/**
 * Retarget or drop one citation of a superseded decision.
 *
 * The token becomes the successor the entry names, or is dropped when the line already cites it —
 * with the space and the parentheses the drop leaves behind tidied away. Like every rewrite here it
 * verifies the text it is about to replace, so a stale line refuses instead of editing the wrong
 * thing.
 */
function rewriteSuperseded(
    root: string,
    site: {file: string; line: number; column: number; raw: string},
    successor: string,
): 'retargeted' | 'dropped' | null {
    const path = join(root, site.file);
    const lines = splitLines(readFileSync(path, 'utf8'));
    const original = lines[site.line - 1];
    if (original === undefined) return null;
    if (original.slice(site.column, site.column + site.raw.length) !== site.raw) return null;
    const before = original.slice(0, site.column);
    const after = original.slice(site.column + site.raw.length);
    const drop = original.includes(`@@${successor}`);
    const next = drop
        ? (before + after)
              .replace(/\(\s+/g, '(')
              .replace(/\s+\)/g, ')')
              .replace(/\(\s*\)/g, '')
              .replace(/ ([.,;:)])/g, '$1')
              .replace(/(\S)[ \t]{2,}(?=\s*@@)/g, '$1 ')
        : `${before}@@${successor}${after}`;
    if (next === original) return null;
    lines[site.line - 1] = next;
    writeFileSync(path, `${lines.join('\n')}\n`);
    return drop ? 'dropped' : 'retargeted';
}

/**
 * The reverse index and the linter.
 *
 * With targets it answers "what cites this?"; with `--summary` it counts per package;
 * by default it is the linter — every `@@` token and every relative link in the three
 * corpora, resolved — and it exits non-zero when one does not resolve. A retired id is
 * a warning, because it is history that names its successor, not a mistake.
 */
function refs(root: string, args: string[], options: Options, flags: Set<string>): void {
    const index = buildReferenceIndex(root);
    const named = options.get('files');
    const files = named
        ? named
              .split(',')
              .map(entry => entry.trim())
              .filter(Boolean)
        : trackedFiles(root);
    const scanned = scanSites(root, files, index);
    const links = scanned.links.filter(link => inCorpus(link.file));

    const wanted = args.filter(Boolean).map(arg => arg.trim().replace(/^@@/, '').toLowerCase());
    if (wanted.length > 0) {
        const chosen = scanned.references.filter(site => {
            const key = targetKey(site.target).toLowerCase();
            return wanted.some(want => key === want || key.startsWith(want));
        });
        if (flags.has('json')) {
            process.stdout.write(`${JSON.stringify(chosen, null, 2)}\n`);
            return;
        }
        for (const site of chosen) {
            process.stdout.write(
                `${site.file}:${site.line}  ${site.raw}  → ${site.resolution.message}\n`,
            );
        }
        process.stdout.write(`# ${chosen.length} site(s) cite ${wanted.join(', ')}\n`);
        return;
    }

    if (flags.has('sites')) {
        // The audit view: every reference beside the title it resolved to, so a person can see a
        // citation that resolves but points at the wrong entry — which no linter can judge.
        const rows = scanned.references
            .filter(site => site.resolution.code !== 'unknown')
            .map(site => ({
                file: site.file,
                line: site.line,
                raw: site.raw,
                text: site.text,
                code: site.resolution.code,
                status: site.resolution.status ?? site.resolution.code,
                successor: site.resolution.successor,
                title: site.resolution.title ?? site.resolution.message,
            }));
        if (flags.has('json')) {
            process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
            return;
        }
        for (const row of rows) {
            process.stdout.write(
                `${row.file}:${row.line}  ${row.raw}  → ${row.title}${statusNote(row)}\n` +
                    `    ${row.text}\n`,
            );
        }
        process.stdout.write(`# ${rows.length} reference(s) with their entry titles\n`);
        return;
    }

    if (flags.has('changed')) {
        const since = options.get('since')?.trim() ?? 'HEAD';
        const changes = changedMemoryEntries(root, since);
        const ids = new Set(changes.map(change => change.id));
        const cited = scanned.references.filter(
            site => site.target.kind === 'entry' && ids.has(site.target.id),
        );
        if (flags.has('json')) {
            process.stdout.write(`${JSON.stringify({since, changes, cited}, null, 2)}\n`);
            return;
        }
        for (const site of cited) {
            process.stdout.write(`${site.file}:${site.line}  ${site.raw}  → re-read it\n`);
        }
        process.stdout.write(
            `# memory refs --changed: ${changes.length} changed entry(ies), ` +
                `${cited.length} site(s) to re-read since ${since}\n`,
        );
        return;
    }

    if (flags.has('fix-anchors')) {
        // Rewrite an anchor that moved when exactly one heading is a plausible target; anything
        // else is reported by the default run rather than guessed at.
        const pageByFile = new Map(
            [...index.docs.values(), ...index.skills.values()].map(page => [page.file, page]),
        );
        let fixed = 0;
        for (const site of scanned.references) {
            if (site.target.kind === 'entry' || !site.target.anchor) continue;
            const anchor = site.target.anchor;
            const page =
                site.target.kind === 'doc'
                    ? index.docs.get(site.target.page)
                    : index.skills.get(site.target.name);
            if (!page || anchor in page.anchors) continue;
            const candidates = nearestAnchor(page.anchors, anchor);
            if (candidates === undefined) continue;
            const next = site.raw.replace(`#${anchor}`, `#${candidates}`);
            if (rewriteToken(root, site, next)) {
                fixed += 1;
                process.stdout.write(`# fixed ${site.file}:${site.line}  ${site.raw} → ${next}\n`);
            }
        }
        for (const link of links) {
            // Only an anchor this rewrites: a link whose file is missing names nothing to fix.
            if (link.code !== 'unknown' || link.reason !== 'anchor' || !link.anchor) continue;
            const page = pageByFile.get(link.target);
            if (!page) continue;
            const candidates = nearestAnchor(page.anchors, link.anchor);
            if (candidates === undefined) continue;
            const next = link.raw.replace(`#${link.anchor}`, `#${candidates}`);
            if (rewriteToken(root, link, next)) {
                fixed += 1;
                process.stdout.write(`# fixed ${link.file}:${link.line}  ${link.raw} → ${next}\n`);
            }
        }
        process.stdout.write(`# memory refs --fix-anchors: ${fixed} anchor(s) rewritten\n`);
        return;
    }

    if (flags.has('fix-superseded')) {
        // A decision that names its successor has moved its reasoning, so the citation follows it.
        // One that names none is left for a person: only a reader knows which entry holds the answer.
        const orphans = new Set<string>();
        let fixed = 0;
        for (const site of scanned.references) {
            if (site.resolution.code !== 'superseded') continue;
            const id = site.target.kind === 'entry' ? site.target.id : site.raw;
            const successor = site.resolution.successor;
            if (!successor) {
                orphans.add(id);
                continue;
            }
            const outcome = rewriteSuperseded(root, site, successor);
            if (outcome === null) {
                process.stdout.write(`# refused ${site.file}:${site.line}  ${site.raw}\n`);
                continue;
            }
            fixed += 1;
            process.stdout.write(
                `${outcome === 'dropped' ? 'dropped' : 'follows'} ${site.file}:${site.line}  ` +
                    `${site.raw} → ${successor}\n`,
            );
        }
        for (const id of orphans) {
            process.stdout.write(`# ${id} names no successor — its citations need a person\n`);
        }
        process.stdout.write(
            `# memory refs --fix-superseded: ${fixed} citation(s) moved to their successor, ` +
                `${orphans.size} entry(s) left for a reader\n`,
        );
        return;
    }

    if (flags.has('summary')) {
        const perPackage = new Map<string, {refs: number; files: Set<string>}>();
        for (const site of scanned.references) {
            const key = packageOf(site.file);
            const record = perPackage.get(key) ?? {refs: 0, files: new Set<string>()};
            record.refs += 1;
            record.files.add(site.file);
            perPackage.set(key, record);
        }
        const rows = [...perPackage].sort((a, b) => b[1].refs - a[1].refs);
        if (flags.has('json')) {
            process.stdout.write(
                `${JSON.stringify(
                    rows.map(([pkg, record]) => ({
                        package: pkg,
                        refs: record.refs,
                        files: record.files.size,
                    })),
                    null,
                    2,
                )}\n`,
            );
            return;
        }
        for (const [pkg, record] of rows) {
            process.stdout.write(
                `# ${pkg}: ${record.refs} ref(s) in ${record.files.size} file(s)\n`,
            );
        }
        process.stdout.write(
            `# ${scanned.references.length} reference(s) in ${files.length} file(s)\n`,
        );
        return;
    }

    const errors: Array<{file: string; line: number; raw: string; message: string}> = [
        ...scanned.references
            .filter(site => isErrorCode(site.resolution.code, site.resolution.successor))
            .map(site => ({
                file: site.file,
                line: site.line,
                raw: site.raw,
                message: site.resolution.successor
                    ? `${site.resolution.message} — refs --fix-superseded retargets it`
                    : site.resolution.message,
            })),
        ...links
            .filter(link => link.code === 'unknown')
            .map(link => ({
                file: link.file,
                line: link.line,
                raw: link.raw,
                message: link.message,
            })),
    ];
    const retired = scanned.references.filter(site => site.resolution.code === 'retired');
    const superseded = scanned.references.filter(site => site.resolution.code === 'superseded');

    if (flags.has('json')) {
        process.stdout.write(
            `${JSON.stringify(
                {
                    dangling: errors,
                    retired: retired.map(site => ({
                        file: site.file,
                        line: site.line,
                        raw: site.raw,
                        message: site.resolution.message,
                    })),
                    superseded: superseded.map(site => ({
                        file: site.file,
                        line: site.line,
                        raw: site.raw,
                        successor: site.resolution.successor,
                        message: site.resolution.message,
                    })),
                    references: scanned.references.length,
                },
                null,
                2,
            )}\n`,
        );
    } else {
        for (const item of errors) {
            process.stderr.write(`✖ ${item.file}:${item.line}  ${item.raw}  ${item.message}\n`);
        }
        for (const site of [...retired, ...superseded]) {
            process.stdout.write(
                `⚠ ${site.file}:${site.line}  ${site.raw}  ${site.resolution.message}\n`,
            );
        }
    }
    if (errors.length === 0) {
        process.stdout.write(
            `# memory refs: ${scanned.references.length} reference(s) resolve, ` +
                `${retired.length} retired, ${superseded.length} superseded\n`,
        );
    }
    if (errors.length > 0) process.exitCode = 1;
}

/**
 * The machine index the editor and a hover read.
 *
 * One JSON document with all three corpora and their anchors. It is derived — the
 * markdown is the source of truth — so `--out` writes a cache the editor watches,
 * and stdout is the same document for a one-off read.
 */
function exportIndex(root: string, options: Options): void {
    const index = buildReferenceIndex(root);
    const payload = {
        version: 1,
        entries: Object.fromEntries(
            [...index.entries].map(([id, holders]) => {
                const first = holders[0]!;
                return [
                    id,
                    {
                        title: first.title,
                        area: first.area,
                        status: first.status,
                        date: first.date,
                        body: first.body,
                        file: first.file,
                        line: first.line,
                        ...(first.successor ? {successor: first.successor} : {}),
                        ...(holders.length > 1
                            ? {alsoIn: holders.slice(1).map(holder => holder.file)}
                            : {}),
                    },
                ];
            }),
        ),
        retired: Object.fromEntries(
            [...index.ledger].map(([id, record]) => [
                id,
                {
                    fate: record.fate,
                    file: record.file,
                    ...(record.successor ? {successor: record.successor} : {}),
                },
            ]),
        ),
        docs: Object.fromEntries(
            [...index.docs].map(([key, page]) => [
                key,
                {title: page.title, tier: page.tier, file: page.file, anchors: page.anchors},
            ]),
        ),
        skills: Object.fromEntries(
            [...index.skills].map(([key, page]) => [
                key,
                {title: page.title, file: page.file, anchors: page.anchors},
            ]),
        ),
    };
    const text = `${JSON.stringify(payload, null, 2)}\n`;
    const out = options.get('out');
    if (out) {
        writeFileSync(resolve(out.trim()), text);
        process.stdout.write(`# wrote ${out}\n`);
        return;
    }
    process.stdout.write(text);
}

/**
 * The `@@` and markdown-link references of the selected files, as check problems.
 *
 * This is what `check --refs` adds to the memory-file checks: the same tree the `refs`
 * linter walks, reported through the check problem shape, so one command covers the
 * entries and everything that cites them.
 */
function referenceProblems(root: string, options: Options): IProblem[] {
    const index = buildReferenceIndex(root);
    const named = options.get('files');
    const files = named
        ? named
              .split(',')
              .map(entry => entry.trim())
              .filter(Boolean)
        : trackedFiles(root);
    const scanned = scanSites(root, files, index);
    const problems: IProblem[] = [];
    for (const site of scanned.references) {
        if (site.resolution.code === 'ok') continue;
        problems.push({
            file: site.file,
            line: site.line,
            message: `reference ${site.raw} — ${site.resolution.message}`,
            severity: isErrorCode(site.resolution.code, site.resolution.successor)
                ? 'error'
                : 'warning',
        });
    }
    for (const link of scanned.links) {
        if (link.code === 'ok' || !inCorpus(link.file)) continue;
        problems.push({
            file: link.file,
            line: link.line,
            message: `link ${link.raw} — ${link.message}`,
            severity: 'error',
        });
    }
    return problems;
}

/** One entry id a diff added, changed or removed. */
interface IComplianceChange {
    id: string;
    file: string;
    how: 'added' | 'edited' | 'removed' | 'status';
    status?: string;
}

/** The `ref:path` contents as lines, or `[]` when the file did not exist then. */
function gitShowLines(root: string, ref: string, file: string): string[] {
    try {
        return splitLines(
            execFileSync('git', ['show', `${ref}:${file}`], {cwd: root}).toString('utf8'),
        );
    } catch {
        return [];
    }
}

/** id → its status and body text, for comparing two revisions of a memory file. */
function entryMap(lines: readonly string[]): Map<string, {status: string; text: string}> {
    const map = new Map<string, {status: string; text: string}>();
    for (const entry of parseDoc(lines).entries) {
        map.set(entry.id, {status: entry.meta?.status ?? '?', text: entry.body.join('\n')});
    }
    return map;
}

/** The memory entries a diff touched, across every scope's `friction`/`todo`/`decision`. */
function changedMemoryEntries(root: string, since: string): IComplianceChange[] {
    let files: string[];
    try {
        files = execFileSync(
            'git',
            ['diff', '--name-only', since, '--', ':(glob)**/.github/memory/**'],
            {cwd: root},
        )
            .toString('utf8')
            .split('\n')
            .filter(Boolean);
    } catch {
        return [];
    }

    const changes: IComplianceChange[] = [];
    for (const file of files) {
        const before = entryMap(gitShowLines(root, since, file));
        const after = entryMap(
            existsSync(join(root, file)) ? splitLines(readFileSync(join(root, file), 'utf8')) : [],
        );
        for (const [id, entry] of before) {
            const now = after.get(id);
            if (!now) {
                changes.push({id, file, how: 'removed'});
            } else if (now.status !== entry.status) {
                changes.push({id, file, how: 'status', status: now.status});
            } else if (now.text !== entry.text) {
                changes.push({id, file, how: 'edited'});
            }
        }
        for (const id of after.keys()) if (!before.has(id)) changes.push({id, file, how: 'added'});
    }
    return changes;
}

/**
 * The compliance gate: what cites an entry this change edited, retired or superseded.
 *
 * An `edit` is a warning — re-read it. A `removed` or superseded/resolved entry is an
 * error, because a site still cites it as live reasoning and the comment now says
 * something the entry no longer supports.
 */
function comply(root: string, options: Options, flags: Set<string>): void {
    const since = options.get('since')?.trim() ?? 'HEAD';
    const changes = changedMemoryEntries(root, since);
    const index = buildReferenceIndex(root);
    const sites = referenceSites(root, trackedFiles(root), index);

    const rows: Array<{
        file: string;
        line: number;
        raw: string;
        change: IComplianceChange;
        severity: IProblem['severity'];
    }> = [];
    for (const change of changes) {
        const stale =
            change.how === 'removed' ||
            (change.how === 'status' &&
                ['superseded', 'resolved', 'done'].includes(change.status ?? ''));
        for (const site of sites.filter(
            candidate => candidate.target.kind === 'entry' && candidate.target.id === change.id,
        )) {
            rows.push({
                file: site.file,
                line: site.line,
                raw: site.raw,
                change,
                severity: stale ? 'error' : 'warning',
            });
        }
    }

    if (flags.has('json')) {
        process.stdout.write(`${JSON.stringify({since, changes, sites: rows}, null, 2)}\n`);
    } else {
        for (const row of rows) {
            const where = row.change.status ? ` (${row.change.status})` : '';
            process.stdout.write(
                `${row.severity === 'error' ? '✖' : '⚠'} ${row.file}:${row.line}  ${row.raw}  ` +
                    `— ${row.change.id} ${row.change.how}${where}, re-read it\n`,
            );
        }
        process.stdout.write(
            `# memory comply: ${changes.length} changed entry(ies), ${rows.length} site(s) to re-read\n`,
        );
    }
    if (rows.some(row => row.severity === 'error')) process.exitCode = 1;
}

function audit(root: string, options: Options, flags: Set<string>): void {
    const docs = docsOf(root, options);
    const entries = docs.flatMap(doc => parseDoc(doc.lines).entries.map(entry => ({doc, entry})));
    // Ids are per file, so the same id in two files is an id a reference cannot
    // resolve — reported alongside the missing ones, because that is what it is from
    // a reader's point of view. A file that holds the id twice is one file, not two.
    const holders = new Map<string, Set<string>>();
    for (const file of listMemoryFiles(root)) {
        for (const entry of parseDoc(readDoc(file.path, file.kind, file.scope).lines).entries) {
            const seen = holders.get(entry.id) ?? new Set<string>();
            seen.add(relative(root, file.path));
            holders.set(entry.id, seen);
        }
    }
    // A retired id is known — it resolves, as a warning that names its successor — so it
    // is not dangling, and the ledger line itself is not a reference to check.
    const ledger = new Set<string>();
    for (const file of listMemoryFiles(root)) {
        for (const line of readDoc(file.path, file.kind, file.scope).lines) {
            const id = LEDGER_LINE.exec(line.trim())?.groups?.['id'];
            if (id) ledger.add(id);
        }
    }
    const known = new Set([...holders.keys(), ...ledger]);
    const ambiguous = Array.from(holders.entries())
        .filter(([, files]) => files.size > 1)
        .map(([id, files]) => ({id, files: [...files]}));

    const dangling: Array<{file: string; line: number; id: string}> = [];
    for (const doc of docs) {
        doc.lines.forEach((line, index) => {
            if (ENTRY_HEADING.test(line) || LEDGER_LINE.test(line.trim())) return;
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
        process.stdout.write(
            `${JSON.stringify({dangling, ambiguous, duplicates, stale}, null, 2)}\n`,
        );
        return;
    }
    for (const item of dangling) {
        process.stdout.write(`# ${item.file}:${item.line} references missing ${item.id}\n`);
    }
    for (const item of ambiguous) {
        process.stdout.write(
            `# ${item.id} is held by ${item.files.length} files — ${item.files.join(', ')}\n`,
        );
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
        `# memory audit: ${dangling.length} dangling reference(s), ${ambiguous.length} ambiguous id(s), ` +
            `${duplicates.length} duplicate title(s), ${stale.length} open older than 90 days\n`,
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
                return await edit(root, positionals[1], options);
            case 'close':
                return await close(root, positionals[1], options);
            case 'retire':
                return await retire(root, positionals[1], options, flags);
            case 'renumber':
                return await renumber(root, positionals[1], options);
            case 'comply':
                return comply(root, options, flags);
            case 'reopen':
                return await reopen(root, positionals[1]);
            case 'move':
                return await move(root, positionals[1], options);
            case 'index':
                return await index(root, options, flags);
            case 'search':
                return await search(positionals.slice(1), options, flags);
            case 'format':
                return format(root, options, flags);
            case 'check':
                return await check(root, options, flags);
            case 'manual':
                return manual(root, rest, flags);
            case 'audit':
                return audit(root, options, flags);
            case 'refs':
                return refs(root, positionals.slice(1), options, flags);
            case 'export':
                return exportIndex(root, options);
            case 'migrate':
                return migrate(root, rest, options, flags);
            case 'import':
                return importBatch(root, positionals.slice(1), options, flags);
            case 'prune':
                return await prune(root, rest, options, flags);
            default:
                process.stderr.write(`blong-dev: unknown memory verb "${verb ?? ''}"\n${USAGE}\n`);
                process.exitCode = 1;
        }
    } catch (error) {
        // Usage errors already printed their message; anything else is a bug.
        if (!(error instanceof UsageError)) throw error;
    }
}
