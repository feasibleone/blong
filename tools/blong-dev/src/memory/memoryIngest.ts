/**
 * The write hook into the semantic index, shared by every command that changes an
 * entry.
 *
 * The markdown is the source of truth and the index is derived, so nothing here may
 * fail the command that calls it: an unreachable server is reported once on stderr and
 * the next `memory index --semantic` repairs whatever was missed. Entries are re-read
 * from the document rather than passed in, because the lines are the only description
 * of an entry that survives a write.
 */

import {relative} from 'node:path';

import {entryDocument, type IHindsightDocument} from './hindsight/hindsightDocument.ts';
import {resolveHindsight} from './hindsight/hindsightRuntime.ts';
import type {IHindsightStore} from './hindsight/hindsightStore.ts';
import {parseDoc} from './memoryParse.ts';
import type {IMemoryDoc} from './memoryTypes.ts';

/** Report a skipped index update without failing the command that made it. */
export function warnIndex(store: IHindsightStore, reason: string): void {
    process.stderr.write(`blong-dev: hindsight index skipped (${store.url}): ${reason}\n`);
}

/** Where an entry that a write touched lives. */
export interface IIngestTarget {
    doc: IMemoryDoc;
    id: string;
}

/**
 * Push entries a write has just changed into the semantic index.
 *
 * `root` is only used for the document's own metadata (the package it belongs to), so a
 * caller that already has the repository root passes it through rather than deriving it
 * a second time.
 */
export async function ingestEntries(
    root: string,
    touched: ReadonlyArray<IIngestTarget>,
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
export async function forgetEntries(ids: readonly string[]): Promise<void> {
    const {store} = resolveHindsight();
    if (!store || ids.length === 0) return;
    const outcome = await store.remove(ids);
    if (!outcome.ok) warnIndex(store, outcome.reason);
}

/** A document's path as a person reads it in the repository. */
export function relPath(root: string, path: string): string {
    return relative(root, path);
}
