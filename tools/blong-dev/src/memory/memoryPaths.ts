/**
 * Where memory files live, and which of them exist.
 *
 * The root scope is `<root>/.github/memory/`; a package scope is
 * `<root>/<projectFolder>/.github/memory/`. Package scopes come from `rush.json`
 * (never from globbing), so an area is always a real project folder.
 */

import {existsSync, readdirSync} from 'node:fs';
import {basename, dirname, join, relative, resolve, sep} from 'node:path';

import {readRushProjects} from '../report/aggregate.ts';
import {repoRoot} from '../report/reportPaths.ts';
import {KIND_FILE, MEMORY_KINDS, RESERVED_AREAS, type MemoryKind} from './memoryTypes.ts';

/** Directory holding a scope's memory files, relative to the scope root. */
export const MEMORY_DIR = '.github/memory';

/** `root` or the package's `projectFolder`. */
export function scopeOf(area: string): string {
    return isReservedArea(area) ? 'root' : area;
}

/** True when the area names a root-level, cross-cutting topic. */
export function isReservedArea(area: string): boolean {
    return RESERVED_AREAS.includes(area);
}

/** Every package folder listed in `rush.json`, in file order. */
export function packageAreas(root: string): string[] {
    return readRushProjects(root).map(project => project.projectFolder);
}

/** Repository root of the workspace containing `cwd`. */
export function rootOf(cwd: string): string {
    return repoRoot(cwd);
}

/** Absolute path of the directory holding a scope's memory files. */
export function scopeDir(root: string, scope: string): string {
    return scope === 'root' ? join(root, MEMORY_DIR) : join(root, scope, MEMORY_DIR);
}

/** Absolute path of one memory file, whether or not it exists. */
export function memoryFile(root: string, area: string, kind: MemoryKind): string {
    return join(scopeDir(root, scopeOf(area)), KIND_FILE[kind]);
}

/** True when the area is a known package or a reserved cross-cutting label. */
export function isKnownArea(root: string, area: string): boolean {
    return isReservedArea(area) || packageAreas(root).includes(area);
}

/**
 * Resolve a package named the way the legacy headings write it — a bare folder
 * name such as `blong-browser`, without its category — to its project folder.
 */
export function projectFolderForName(root: string, name: string): string | null {
    const match = readRushProjects(root).find(
        project => project.packageName === name || project.projectFolder.endsWith(`/${name}`),
    );
    return match?.projectFolder ?? null;
}

/** A memory file found in the workspace. */
export interface IMemoryFileRef {
    path: string;
    kind: MemoryKind;
    /** `root` or a package's `projectFolder`. */
    scope: string;
}

/** Every memory file that exists, root scope first then packages in rush order. */
export function listMemoryFiles(root: string): IMemoryFileRef[] {
    const found: IMemoryFileRef[] = [];
    const scopes = ['root', ...packageAreas(root)];
    for (const scope of scopes) {
        for (const kind of MEMORY_KINDS) {
            const path = join(scopeDir(root, scope), KIND_FILE[kind]);
            if (existsSync(path)) found.push({path, kind, scope});
        }
    }
    return found;
}

/** Scope directories that hold at least one memory file, root first. */
export function listScopes(root: string): string[] {
    const scopes = ['root', ...packageAreas(root)];
    return scopes.filter(scope => {
        const dir = scopeDir(root, scope);
        if (!existsSync(dir)) return false;
        return readdirSync(dir).some(name => name.endsWith('.md'));
    });
}

/** Kind of a memory file name, or `null` when it is not one. */
export function kindOfFileName(name: string): MemoryKind | null {
    for (const kind of MEMORY_KINDS) {
        if (KIND_FILE[kind] === name) return kind;
    }
    return null;
}

/**
 * Kind and scope of an absolute path, or `null` when the path is not a memory
 * file. The scope is derived from the directory, so a file passed with
 * `--files` needs no other context.
 */
export function describeFile(root: string, path: string): {kind: MemoryKind; scope: string} | null {
    const kind = kindOfFileName(basename(path));
    if (kind === null) return null;
    const scopeRoot = dirname(dirname(dirname(resolve(path))));
    const resolvedRoot = resolve(root);
    if (scopeRoot === resolvedRoot) return {kind, scope: 'root'};
    const rel = relative(resolvedRoot, scopeRoot).split(sep).join('/');
    return rel.startsWith('..') ? null : {kind, scope: rel};
}
