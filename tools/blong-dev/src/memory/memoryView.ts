/**
 * Reading memory entries across every file, for a command that is not `memory`
 * itself.
 *
 * `blong-dev plan` has to answer three questions about an id written in a plan: does
 * it exist, where does it live, and is it still open. All three are one walk of the
 * memory files, so they are one function here rather than a copy of the walk in each
 * command.
 */

import {relative} from 'node:path';

import {parseDoc, readDoc} from './memoryParse.ts';
import {listMemoryFiles} from './memoryPaths.ts';
import type {MemoryKind} from './memoryTypes.ts';

/** One entry as a reader of the repository sees it. */
export interface IMemoryEntryView {
    id: string;
    kind: MemoryKind;
    /** The scope the file belongs to: `root` or a package folder. */
    scope: string;
    /** Repository-relative path of the file that holds it. */
    path: string;
    title: string;
    area: string;
    status: string;
    date: string;
    body: string[];
}

/** Every entry in every memory file, in file order. */
export function listEntries(root: string): IMemoryEntryView[] {
    const entries: IMemoryEntryView[] = [];
    for (const file of listMemoryFiles(root)) {
        const doc = readDoc(file.path, file.kind, file.scope);
        for (const entry of parseDoc(doc.lines).entries) {
            entries.push({
                id: entry.id,
                kind: file.kind,
                scope: file.scope,
                path: relative(root, file.path),
                title: entry.title,
                area: entry.meta?.area ?? '',
                status: entry.meta?.status ?? '?',
                date: entry.meta?.date ?? '?',
                body: entry.body,
            });
        }
    }
    return entries;
}

/** Every entry that holds an id; more than one is the ambiguity `memory show` refuses. */
export function entriesById(root: string, id: string): IMemoryEntryView[] {
    const wanted = id.trim().toUpperCase();
    return listEntries(root).filter(entry => entry.id === wanted);
}

/** The statuses a task-like entry may carry and still be open work. */
export const OPEN_STATUSES: readonly string[] = ['open', 'active'];
