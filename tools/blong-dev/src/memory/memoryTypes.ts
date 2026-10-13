/**
 * Vocabulary of the agent memory files.
 *
 * A memory file holds entries — `### <ID> — <title>`, a `date · area · status`
 * meta line and a body — inside status sections, with a generated index block at
 * the top. Everything the CLI writes goes through these constants, so the format
 * is defined in exactly one place.
 *
 * Two scopes exist: the repository root (`.github/memory/`, cross-cutting
 * entries only) and a package (`<pkg>/.github/memory/`). The scope is the
 * directory, never the entry: root entries carry their own area in the meta line.
 */

/** The three kinds, one file each per scope. */
export type MemoryKind = 'friction' | 'todo' | 'decision';

/** File name inside `.github/memory/`, per kind. */
export const KIND_FILE: Record<MemoryKind, string> = {
    friction: 'friction.md',
    todo: 'todo.md',
    decision: 'decision.md',
};

/** Id prefix per kind: `F-001`, `T-001`, `D-001`. */
export const KIND_PREFIX: Record<MemoryKind, string> = {
    friction: 'F',
    todo: 'T',
    decision: 'D',
};

export const MEMORY_KINDS: readonly MemoryKind[] = ['friction', 'todo', 'decision'];

/** Statuses a kind may use, in the order an index lists them. */
export const KIND_STATUSES: Record<MemoryKind, readonly string[]> = {
    friction: ['open', 'resolved'],
    todo: ['open', 'done'],
    decision: ['active', 'superseded'],
};

/**
 * The section that records a closed or pruned id so its number is never reused.
 *
 * A `## Retired` bullet (`- F-101 — superseded by F-090 (2026-08-01)`) keeps the id
 * resolvable after its entry is gone: a stale reference is a warning that names its
 * successor, not a mystery. Ids are allocated from the highest number in the entries
 * _and_ the ledger, so a closed entry's number does not come back.
 */
export const RETIRED_SECTION = 'Retired';

/** Sections a kind may use, in file order. */
export const KIND_SECTIONS: Record<MemoryKind, readonly string[]> = {
    friction: ['Open', 'Resolved', RETIRED_SECTION],
    todo: ['Manual', 'Open', 'Done', RETIRED_SECTION],
    decision: ['Active', 'Superseded', RETIRED_SECTION],
};

/** Sections a freshly created file starts with. */
export const SKELETON_SECTIONS: Record<MemoryKind, readonly string[]> = {
    friction: ['Open', 'Resolved'],
    todo: ['Open'],
    decision: ['Active', 'Superseded'],
};

/** The section a status belongs in. */
export const SECTION_FOR_STATUS: Record<string, string> = {
    open: 'Open',
    resolved: 'Resolved',
    done: 'Done',
    active: 'Active',
    superseded: 'Superseded',
};

/** The status a section implies. */
export const STATUS_FOR_SECTION: Record<string, string> = {
    Open: 'open',
    Resolved: 'resolved',
    Done: 'done',
    Active: 'active',
    Superseded: 'superseded',
};

/** The default status a new entry gets. */
export const DEFAULT_STATUS: Record<MemoryKind, string> = {
    friction: 'open',
    todo: 'open',
    decision: 'active',
};

/** H1 of a scope's file, per kind. */
export const KIND_TITLE: Record<MemoryKind, string> = {
    friction: 'Frictions',
    todo: 'Todo',
    decision: 'Decisions',
};

/** The sentence that opens a fresh file. */
export const KIND_PURPOSE: Record<MemoryKind, string> = {
    friction: 'Things that took unexpected effort to implement or fix, and the lesson that came out of them.',
    todo: 'Work that is deferred, unfinished, or spotted and not done yet.',
    decision: 'Decisions that were taken, with the reasoning the code does not show.',
};

/** Cross-cutting areas that live in the root files. */
export const RESERVED_AREAS: readonly string[] = ['cross-cutting', 'ci', 'docs', 'skills'];

/**
 * The section that records a closed or pruned id so its number is never reused.
 *
 * A `## Retired` bullet (`- F-101 — superseded by F-090 (2026-08-01)`) keeps the id
 * resolvable after its entry is gone: a stale reference is a warning that names its
 * successor, not a mystery. Ids are allocated from the highest number in the entries
 * *and* the ledger, so a closed entry's number does not come back.

/** Prose is hard-wrapped here, matching the repository's prettier `printWidth`. */
export const MAX_LINE_LENGTH = 100;

/** Entry titles stay on one line, so they have a tighter budget. */
export const MAX_TITLE_LENGTH = 80;

/** The generated index sits between these two lines, verbatim. */
export const INDEX_START = '<!-- memory:index -->';
export const INDEX_END = '<!-- /memory:index -->';

/** `### F-014 — realm add is not idempotent`. */
export const ENTRY_HEADING = /^###\s+(?<id>[A-Z]-\d{3})\s*(?:—|-)?\s*(?<title>.*)$/;

/** Section heading: `## Open`. */
export const SECTION_HEADING = /^##\s+(?<heading>.+?)\s*$/;

/** Id prefix → kind, for ids found in prose. */
export const KIND_BY_PREFIX: Record<string, MemoryKind> = {
    F: 'friction',
    T: 'todo',
    D: 'decision',
};

/** Any memory id mentioned in prose. */
export const ID_REFERENCE = /\b[FTD]-\d{3}\b/g;

/**
 * A cross-reference token written outside a memory file: `@@F-014`, an entry id;
 * `@@doc:patterns/memory#anchor`, a documentation page and section; `@@skill:blong-realm#layers`,
 * an agent skill and section. One grammar for all three corpora, so one resolver, one linter and
 * one editor provider cover them.
 *
 * The token is deliberately plain: `@@` cannot appear in TypeScript, YAML, shell or markdown
 * syntax, so it needs no escaping and is greppable as text (`grep -rF '@@T-'`). The scope qualifier
 * (`@@F-014@root`) is not part of a reference — that form is the CLI's own addressing; an id that
 * two files hold is an error a `memory renumber` fixes.
 */
export const REFERENCE =
    /@@(?:(?<id>[FTD]-\d{3})|doc:(?<docTier>[a-z0-9-]+)\/(?<docName>[a-z0-9.-]+)(?:#(?<docAnchor>[a-z0-9-]+))?|skill:(?<skillName>[a-z0-9-]+)(?:#(?<skillAnchor>[a-z0-9-]+))?)/g;

/** A line-number reference to a memory file — forbidden, they rot. */
export const LINE_REFERENCE = /\b(?:friction|todo|decision)\.md\s+(?:line\s+)?L\d+\b/i;

/** An entry as stored in a file. */
export interface IMemoryEntry {
    /** `F-014`. */
    id: string;
    title: string;
    /** Parsed meta line, or `null` when it is missing or malformed. */
    meta: IMemoryMeta | null;
    /** Body lines, without the trailing blank separator. */
    body: string[];
    /** 0-based index of the `### ` line. */
    start: number;
    /** 0-based index of the last body line (inclusive). */
    end: number;
    /** Heading of the section the entry sits in. */
    section: string;
}

/** The `date · area · status` line. */
export interface IMemoryMeta {
    date: string;
    area: string;
    status: string;
}

/** A `## Heading` and its content. */
export interface IMemorySection {
    heading: string;
    /** 0-based index of the `## ` line. */
    start: number;
    /** 0-based index of the last line of the section (inclusive). */
    end: number;
    entries: IMemoryEntry[];
    /** Lines in the section that are not part of an entry, kept verbatim. */
    other: string[];
}

/** The structure of one memory file. */
export interface IMemoryStructure {
    /** H1 text without the `# `. */
    title: string | null;
    /** Inclusive 0-based line range of the index block, markers included. */
    indexRange: [number, number] | null;
    sections: IMemorySection[];
    /** Every entry in file order. */
    entries: IMemoryEntry[];
}

/** A memory file: its path plus its raw lines. Edits are line splices, so
 * nothing outside the edit can be lost or reformatted by accident. */
export interface IMemoryDoc {
    path: string;
    kind: MemoryKind;
    /** `root` or a package's `projectFolder`. */
    scope: string;
    lines: string[];
}
