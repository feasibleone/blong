/**
 * Turning a documentation page or an agent skill into the document Hindsight stores.
 *
 * A memory entry is a transient event: it is written once, superseded later, and its
 * id is the upsert key. A documentation page and a skill file are the opposite — they
 * are stable state, edited in place for as long as they live — so ingesting them the
 * same way would leave a fragment behind on every edit. They are therefore given a
 * `document_id` derived from their path, which is stable across edits and unique in
 * the tree, and the same upsert replaces the previous text instead of adding to it.
 *
 * The taxonomy is carried in the same flat `prefix:value` tags the entries use, so
 * one `recall` filter can span the sources (see `hindsightSources.ts`).
 *
 * How this differs from the plan it came from: that draft carried `page_id` in an
 * object beside a nested `tags: {type, stability}`. Here the page id *is* the
 * document id — Hindsight's upsert key — and the nested tags are flattened, because
 * a Hindsight tag is a string and nothing else can be filtered on.
 */

import {readFileSync, statSync} from 'node:fs';
import {basename, dirname, relative} from 'node:path';

import type {IHindsightDocument} from './hindsightDocument.ts';

/** The tag every documentation page carries. */
export const DOCS_TAG = 'type:documentation';

/** The tag every agent skill carries. */
export const SKILL_TAG = 'type:agent-skill';

/** A file to ingest as a stable page. */
export interface IPageSource {
    /** Which stream it belongs to. */
    kind: 'docs' | 'skill';
    /** Absolute path of the file. */
    path: string;
    /** Its path inside its own root: `patterns/memory.md`, `blong-handler/SKILL.md`. */
    relativePath: string;
    /** A documentation page's tier folder (`concepts`, `patterns`, `rationale`). */
    tier?: string;
}

/** A stable slug: lowercase, runs of anything else joined by a single `-`. */
export function slug(value: string): string {
    return value
        .toLowerCase()
        .replace(/\.md$/, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * The page id of a documentation page, from its path inside the docs root.
 *
 * `patterns/memory.md` → `doc-patterns-memory`. The tier stays in the id, so two
 * pages called `overview` in different tiers cannot collide.
 */
export function docsPageId(relativePath: string): string {
    return `doc-${slug(relativePath)}`;
}

/**
 * The page id of an agent skill.
 *
 * `blong-handler/SKILL.md` → `skill-blong-handler`. The front-matter `name` wins
 * when it is present, because that is the skill's own identity and the folder is
 * only a convention — with the folder as the fallback, so a skill without
 * front-matter still gets a stable id.
 */
export function skillPageId(relativePath: string, text: string): string {
    return `skill-${slug(declaredName(text) ?? basename(dirname(relativePath)))}`;
}

/** The `name:` a `SKILL.md` declares in its front-matter, or `null`. */
function declaredName(text: string): string | null {
    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    if (!front) return null;
    const name = /^name:[ \t]*(.+)$/m.exec(front[1] ?? '');
    return name?.[1]?.trim() ?? null;
}

/** Build the document for one page or skill file. */
export function pageDocument(root: string, source: IPageSource): IHindsightDocument {
    const text = readFileSync(source.path, 'utf8');
    const path = relative(root, source.path);
    const isDocs = source.kind === 'docs';

    const id = isDocs ? docsPageId(source.relativePath) : skillPageId(source.relativePath, text);

    const tags = isDocs
        ? [DOCS_TAG, 'stability:stable', `tier:${source.tier ?? 'unknown'}`, `path:${path}`]
        : [SKILL_TAG, 'scope:behavioral-instruction', 'execution:procedural', `path:${path}`];

    const metadata: Record<string, string> = {id, path};
    if (isDocs) {
        metadata['type'] = 'documentation';
        metadata['tier'] = source.tier ?? 'unknown';
    } else {
        metadata['type'] = 'agent-skill';
        metadata['scope'] = 'behavioral-instruction';
    }

    return {
        documentId: id,
        // Verbatim: for a skill the front-matter description is the routing text, and
        // for a page the whole prose is the material a search is meant to find.
        content: text,
        context: isDocs ? `Project Documentation: ${path}` : `Agent Skill Procedure: ${path}`,
        tags,
        metadata,
        timestamp: statSync(source.path).mtime.toISOString(),
    };
}

/** Every page of every source, as retainable documents. */
export function pageDocuments(root: string, sources: readonly IPageSource[]): IHindsightDocument[] {
    return sources.map(source => pageDocument(root, source));
}
