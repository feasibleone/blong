/**
 * Turning a memory entry into the document Hindsight stores.
 *
 * One entry is one document, keyed by the entry id: Hindsight replaces a document
 * whose id already exists, so re-ingesting an edited entry is an upsert and never
 * leaves the previous text behind, while an unrelated entry in the same file is
 * untouched. That is why an `edit` re-ingests one entry rather than a whole file.
 *
 * The fields worth filtering on later go into `tags`, not `metadata`: recall can
 * filter by tags and by nothing else. Metadata carries the same dimensions along
 * for the server-side UI, which is where a human reads them.
 */

import {relative} from 'node:path';

import {parseDoc} from '../memoryParse.ts';
import type {IMemoryDoc, IMemoryEntry, MemoryKind} from '../memoryTypes.ts';

/** A document ready to be retained. */
export interface IHindsightDocument {
    /** The entry id (`F-316`) — also the upsert key. */
    documentId: string;
    /** The entry exactly as it stands in the file, heading and meta line included. */
    content: string;
    /** What the entry is, for the extractor's benefit. */
    context: string;
    /** Filterable dimensions; recall matches on these. */
    tags: string[];
    /** The same dimensions as plain metadata, for the server's own UI. */
    metadata: Record<string, string>;
    /** The entry's date as an ISO timestamp, when it has one. */
    timestamp?: string;
    observationScopes: string[][];
}

/** Every memory document carries this tag, so a search can exclude foreign ones. */
export const MEMORY_TAG = 'memory';

/** Tag for an entry's kind (`kind:friction`). */
export function kindTag(kind: MemoryKind): string {
    return `kind:${kind}`;
}

/** Tag for an entry's area (`area:core/blong-browser`). */
export function areaTag(area: string): string {
    return `area:${area}`;
}

/** Tag for an entry's status (`status:open`). */
export function statusTag(status: string): string {
    return `status:${status}`;
}

/** Tag for an entry's id (`id:F-316`). */
export function idTag(id: string): string {
    return `id:${id}`;
}

/** Tag for an entry's file (`path:.github/memory/friction.md`). */
export function pathTag(path: string): string {
    return `path:${path}`;
}

/**
 * The value of a prefixed tag, or `null` when the entry does not carry it.
 *
 * Tags are a flat list, so `id:F-316` is the only place an entry's id survives the
 * round trip through the server unless `document_id` is also read.
 */
export function tagValue(tags: readonly string[], prefix: string): string | null {
    const head = `${prefix}:`;
    const found = tags.find(tag => tag.startsWith(head));
    return found ? found.slice(head.length) : null;
}

/** `2026-09-30` becomes `2026-09-30T00:00:00Z`; anything else is passed through. */
export function isoDate(date: string | undefined): string | undefined {
    if (!date) return undefined;
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00Z` : date;
}

/** Build the document for one entry. */
export function entryDocument(
    root: string,
    doc: IMemoryDoc,
    entry: IMemoryEntry,
): IHindsightDocument {
    const path = relative(root, doc.path);
    const tags = [MEMORY_TAG, kindTag(doc.kind), idTag(entry.id), pathTag(path)];
    const observationScopes = [kindTag(doc.kind)];
    const metadata: Record<string, string> = {id: entry.id, kind: doc.kind, path};

    const {area, status, date} = entry.meta ?? {};
    if (area) {
        tags.push(areaTag(area));
        observationScopes.push(areaTag(area));
        metadata['area'] = area;
    }
    if (status) {
        tags.push(statusTag(status));
        observationScopes.push(statusTag(status));
        metadata['status'] = status;
    }
    if (date) metadata['date'] = date;

    const document: IHindsightDocument = {
        documentId: entry.id,
        content: doc.lines.slice(entry.start, entry.end + 1).join('\n'),
        context: `${doc.kind} entry ${entry.id} in ${path}`,
        tags,
        metadata,
        observationScopes: [observationScopes],
    };

    const timestamp = isoDate(date);
    if (timestamp) document.timestamp = timestamp;
    return document;
}

/**
 * Every entry of every document, as retainable documents.
 *
 * The root todo file's `## Manual` section is skipped for free: its items are plain
 * list lines, not `### <id>` entries, so the parser never yields them — which is
 * right, since they are the user's own list rather than something to index.
 */
export function entryDocuments(root: string, docs: readonly IMemoryDoc[]): IHindsightDocument[] {
    return docs.flatMap(doc =>
        parseDoc(doc.lines).entries.map(entry => entryDocument(root, doc, entry)),
    );
}
