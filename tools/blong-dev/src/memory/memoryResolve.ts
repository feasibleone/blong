/**
 * Resolving an id that more than one memory file may hold.
 *
 * Ids are allocated per file — each scope's `todo.md` counts its own `T-…` from
 * one — so a bare id can name an entry in the repository root and a different one
 * in a package. A reference in a plan, a commit message or a `Superseded by` line
 * cannot say which, and answering with whichever file the search happened to reach
 * first is how an edit lands on the wrong entry.
 *
 * The rules are therefore:
 *
 * 1. A qualified id (`T-229@core/blong-gogo`, or `@root` for the repository root)
 *    names one file; if that file does not hold the id, the id is not found there
 *    and the files that do hold it are listed.
 * 2. A bare id held by exactly one file is that entry.
 * 3. A bare id held by several files resolves to the package the command was run
 *    from — the package whose folder encloses the current directory, longest match
 *    first. The root scope is deliberately not a fallback: running `memory edit T-1`
 *    from the repository root used to mean "whichever file comes first", and the
 *    useful answer there is to be told which files hold it.
 * 4. Anything else is refused as ambiguous, listing every file that holds the id.
 *
 * The rules are pure functions of the hits and the current directory, so they can be
 * tested without a repository.
 */

import {join, resolve, sep} from 'node:path';

import type {IMemoryFileRef} from './memoryPaths.ts';
import type {IMemoryEntry} from './memoryTypes.ts';

/** An id found in one file. */
export interface IIdHit {
    file: IMemoryFileRef;
    entry: IMemoryEntry;
}

/** An id as the command line wrote it. */
export interface IParsedId {
    /** Upper-cased, because the ids are compared case-insensitively. */
    id: string;
    /** `null` for a bare id; a project folder or `root` when the id was qualified. */
    scope: string | null;
}

/** How a resolution settled on its answer, for the message the caller prints. */
export type ResolutionHow =
    /** The only file that holds the id. */
    | 'unique'
    /** The file the id was qualified with. */
    | 'scope'
    /** The package the command was run from. */
    | 'preferred'
    /** Several files hold it and none of them is the current package. */
    | 'ambiguous'
    /** A scope was asked for and does not hold the id. */
    | 'scope-miss'
    /** No file holds the id. */
    | 'missing';

/** The outcome of resolving an id. */
export interface IIdResolution {
    /** The entry to act on, when resolution settled on one. */
    hit?: IIdHit;
    /** Every file holding the id, in search order — what an ambiguity message lists. */
    hits: IIdHit[];
    how: ResolutionHow;
    /** The scope that was asked for, when `how` is `scope-miss`. */
    scope?: string;
}

/**
 * Split an id into its id and the scope it was qualified with.
 *
 * `@` is the separator rather than `/` or `:` because an id never contains it and a
 * scope path does not either, so the last `@` is unambiguous. `@root` names the
 * repository-root memory.
 */
export function parseId(text: string): IParsedId {
    const at = text.lastIndexOf('@');
    if (at <= 0) return {id: text.trim().toUpperCase(), scope: null};
    const scope = text
        .slice(at + 1)
        .trim()
        .replace(/\/+$/, '');
    return {id: text.slice(0, at).trim().toUpperCase(), scope: scope === '' ? null : scope};
}

/**
 * The scope a command run from `cwd` speaks for.
 *
 * `scopes` is the list of known scopes (`root` plus the package folders). The root
 * scope is excluded: it encloses every package, so it would win every time and there
 * would be no ambiguity left to report. The longest enclosing folder wins, so a
 * package inside another package's folder answers for itself.
 */
export function scopeForCwd(cwd: string, root: string, scopes: readonly string[]): string | null {
    const here = resolve(cwd);
    let best: string | null = null;
    for (const scope of scopes) {
        if (scope === 'root') continue;
        const dir = join(resolve(root), scope);
        if (here !== dir && !here.startsWith(dir + sep)) continue;
        if (best === null || scope.length > best.length) best = scope;
    }
    return best;
}

/** Resolve an id against the files that hold it. */
export function resolveId(
    parsed: IParsedId,
    hits: readonly IIdHit[],
    preferredScope: string | null,
): IIdResolution {
    const all = [...hits];
    if (parsed.scope !== null) {
        const scoped = all.filter(hit => hit.file.scope === parsed.scope);
        if (scoped.length > 0) return {hit: scoped[0], hits: scoped, how: 'scope'};
        return {hits: all, how: 'scope-miss', scope: parsed.scope};
    }
    if (all.length === 0) return {hits: [], how: 'missing'};
    if (all.length === 1) return {hit: all[0], hits: all, how: 'unique'};

    const preferred =
        preferredScope === null ? [] : all.filter(hit => hit.file.scope === preferredScope);
    if (preferred.length === 1) return {hit: preferred[0], hits: all, how: 'preferred'};
    // Two entries in the same file is a file that holds the id twice; that is a
    // duplicate in the file, not an ambiguity the caller can resolve by naming a scope.
    if (preferred.length > 1) return {hits: preferred, how: 'ambiguous'};
    return {hits: all, how: 'ambiguous'};
}
