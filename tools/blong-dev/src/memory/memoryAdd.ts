/**
 * Writing a new memory entry, shared by `blong-dev memory add` and
 * `blong-dev plan tasks`.
 *
 * The two commands differ only in where the title, area and body come from; the id
 * allocation, the section, the formatting and the index refresh are the format's, so
 * they live here once. Callers validate their own arguments first and print their own
 * usage — this module throws {@link UsageError} with a message that is worth showing.
 */

import {existsSync, readFileSync} from 'node:fs';
import {relative, resolve} from 'node:path';

import {UsageError} from '../utils/usageError.ts';
import {
    bodyLines,
    clearRetired,
    ensureDoc,
    entryLines,
    insertEntry,
    nextId,
    refreshIndex,
    removeEntry,
    writeDoc,
} from './memoryEdit.ts';
import {ingestEntries} from './memoryIngest.ts';
import {parseDoc, readDoc} from './memoryParse.ts';
import {isKnownArea, listMemoryFiles} from './memoryPaths.ts';
import {
    DEFAULT_STATUS,
    KIND_STATUSES,
    MAX_TITLE_LENGTH,
    SECTION_FOR_STATUS,
    type IMemoryDoc,
    type MemoryKind,
} from './memoryTypes.ts';

/** What a caller asks for. */
export interface IAddMemoryInput {
    kind: MemoryKind;
    title: string;
    /** A package folder, or one of the reserved root areas; `cross-cutting` by default. */
    area?: string;
    /** Body lines, already formatted by `bodyLines`; the caller owns the formatting. */
    body?: readonly string[];
    /** A status the kind allows; the kind's default otherwise. */
    status?: string;
    /** An id to reuse — only for taking one back from the ledger. */
    id?: string;
    /** The entry's date, as `YYYY-MM-DD`; today otherwise. */
    date?: string;
}

/** What was written. */
export interface IAddMemoryResult {
    id: string;
    /** Repository-relative path of the file it landed in. */
    path: string;
    area: string;
    status: string;
}

/**
 * The reason a file cannot be edited by the CLI, or `null` when it can.
 *
 * Every file in the memory format carries a generated index; a file without one still
 * holds the legacy shape, where an inserted entry would land next to prose the parser
 * cannot describe. `check` is the diagnostic for those files, so it is deliberately not
 * guarded.
 */
export function migrationProblem(doc: IMemoryDoc): string | null {
    if (parseDoc(doc.lines).indexRange) return null;
    return (
        `${doc.path} is not in the memory format yet (no generated index block) — ` +
        'migrate it before a write can touch it'
    );
}

/** Today as `YYYY-MM-DD`. */
export function today(): string {
    return new Date().toISOString().slice(0, 10);
}

/** Format a body supplied as one string, the way `--body` does. */
export function formatBody(text: string): string[] {
    return bodyLines(text);
}

/**
 * Add one entry and hand it to the semantic index.
 *
 * `root` is the repository root, because ids are allocated across every memory file and
 * the area names the package whose file receives the entry.
 */
export async function addMemoryEntry(
    root: string,
    input: IAddMemoryInput,
): Promise<IAddMemoryResult> {
    const {kind} = input;
    const title = input.title.trim();
    if (!title) throw new UsageError('an entry needs a title');
    if (title.length > MAX_TITLE_LENGTH) {
        throw new UsageError(
            `title is ${title.length} characters; keep it under ${MAX_TITLE_LENGTH}`,
        );
    }

    const area = (input.area ?? 'cross-cutting').trim();
    if (!isKnownArea(root, area)) {
        throw new UsageError(
            `unknown area "${area}" — use a package folder or cross-cutting, ci, docs, skills`,
        );
    }

    const status = (input.status ?? DEFAULT_STATUS[kind]).trim();
    if (!KIND_STATUSES[kind].includes(status)) {
        throw new UsageError(`status "${status}" is not one of ${KIND_STATUSES[kind].join(', ')}`);
    }

    const id = (input.id ?? nextId(root, kind)).toUpperCase();
    const date = (input.date ?? today()).trim();
    const body = [...(input.body ?? [])];

    const doc = ensureDoc(root, area, kind);
    const problem = migrationProblem(doc);
    if (problem) throw new UsageError(problem);

    // An explicit id may be one the ledger holds as retired — an entry a `close`
    // reduced to a ledger line, being put back with a body recovered from elsewhere.
    // `check` rejects an id that is both an entry and a retired id, so the line goes
    // with it; the fate it recorded is reported so the caller sees what it replaced.
    if (input.id) {
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

    await ingestEntries(root, [{doc, id}]);
    return {id, path: relative(root, doc.path), area, status};
}

/** Resolve a path a caller typed, relative to the working directory. */
export function bodyFileLines(file: string): string[] {
    const path = resolve(file.trim());
    if (!existsSync(path)) throw new UsageError(`no such body file: ${path}`);
    return bodyLines(readFileSync(path, 'utf8'));
}

/** Where an entry lives, for a caller that already holds its id. */
interface IEntryLocation {
    doc: IMemoryDoc;
    entry: ReturnType<typeof parseDoc>['entries'][number];
}

/** Every document that holds an id, refusing an ambiguous one. */
function locate(root: string, id: string): IEntryLocation {
    const wanted = id.trim().toUpperCase();
    const hits: IEntryLocation[] = [];
    for (const file of listMemoryFiles(root)) {
        const doc = readDoc(file.path, file.kind, file.scope);
        for (const entry of parseDoc(doc.lines).entries) {
            if (entry.id === wanted) hits.push({doc, entry});
        }
    }
    if (hits.length === 0) throw new UsageError(`no entry with id ${wanted}`);
    if (hits.length > 1) {
        throw new UsageError(
            `${wanted} is held by ${hits.map(hit => relative(root, hit.doc.path)).join(', ')} — ` +
                'qualify it with the scope or renumber it',
        );
    }
    return hits[0]!;
}

/**
 * Rewrite an entry's title and body, keeping its id, meta and section.
 *
 * The plan's `--update` pass re-reads a detail that was edited in the plan, so the
 * entry is re-rendered from the parsed parts rather than edited line by line.
 */
export async function replaceMemoryEntry(
    root: string,
    id: string,
    input: {title?: string; body?: readonly string[]},
): Promise<void> {
    const {doc, entry} = locate(root, id);
    const problem = migrationProblem(doc);
    if (problem) throw new UsageError(problem);

    const title = (input.title ?? entry.title).trim();
    if (title.length > MAX_TITLE_LENGTH) {
        throw new UsageError(
            `title is ${title.length} characters; keep it under ${MAX_TITLE_LENGTH}`,
        );
    }
    const body = input.body ? [...input.body] : entry.body;
    if (input.body && body.length === 0 && entry.body.length > 0) {
        throw new UsageError('the new body is empty — pass text, or drop --update');
    }

    removeEntry(doc, entry);
    insertEntry(
        doc,
        entry.section,
        entryLines(entry.id, title, {...entry.meta!, status: entry.meta?.status ?? 'open'}, body),
    );
    refreshIndex(doc);
    writeDoc(doc);
    await ingestEntries(root, [{doc, id: entry.id}]);
}
