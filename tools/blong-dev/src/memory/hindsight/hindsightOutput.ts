/**
 * Printing search results.
 *
 * The first reader of a search is an agent, and the second is a person deciding
 * whether the hit is the one they meant — so every block carries the three things
 * that make a hit checkable without opening a file: how relevant the server
 * thought it was, which entry it is, and where it lives. Blocks are separated by
 * a rule so no reader has to guess where one snippet ends and the next begins.
 */

import {wrapText} from '../memoryFormat.ts';
import {MAX_LINE_LENGTH} from '../memoryTypes.ts';
import {tagValue} from './hindsightDocument.ts';
import type {IHindsightHit} from './hindsightStore.ts';

/** Width of the block rules, and the line the snippets wrap at. */
const RULE_WIDTH = 78;

/** Where the results came from, so a surprising result set is explainable. */
export interface ISearchContext {
    bank: string;
    url: string;
}

/** A rule with a label on it: `--- 1/3 -----…`. */
function rule(label: string): string {
    const head = `--- ${label} `;
    return head + '-'.repeat(Math.max(3, RULE_WIDTH - head.length));
}

/** Wrap one hit's text, keeping its blank lines as blank lines. */
function snippet(text: string): string[] {
    return text
        .split('\n')
        .flatMap(line => (line.trim() === '' ? [''] : wrapText(line, '', '', MAX_LINE_LENGTH)));
}

/** The identifying line over a snippet: `F-316 · friction · open · similarity 0.642`. */
function describeHit(hit: IHindsightHit): string {
    const id = tagValue(hit.tags, 'id') ?? hit.documentId;
    // An entry's kind, else a page's own `type:` tag, and only then the server's
    // memory-unit type — which is a fact type (`world`) and reads as a kind that
    // does not exist.
    const kind = tagValue(hit.tags, 'kind') ?? tagValue(hit.tags, 'type') ?? hit.type;
    const status = tagValue(hit.tags, 'status');
    // Cosine similarity, not the ranking score: 0.642 means something to a reader,
    // while the ranking score is not calibrated across queries. A keyword-only hit has
    // none, and is printed without one rather than with a number that reads as "bad".
    const similarity = hit.similarity === null ? null : `similarity ${hit.similarity.toFixed(3)}`;
    const parts = [id, kind, status, similarity].filter(
        (part): part is string => part !== null && part !== undefined && part !== '',
    );
    return parts.length > 0 ? parts.join(' · ') : '(unrecognised result)';
}

/** The path an entry lives at, from the tag the ingest step wrote. */
function hitPath(hit: IHindsightHit): string | null {
    return tagValue(hit.tags, 'path');
}

/**
 * Render a result set as lines.
 *
 * Empty results are not an error: the bank may simply not hold the entry yet, so
 * the hint points at the backfill rather than at a failure.
 */
export function formatSearchResults(
    hits: readonly IHindsightHit[],
    query: string,
    context: ISearchContext,
): string[] {
    const lines: string[] = [];

    if (hits.length === 0) {
        lines.push(`# memory search: no match for "${query}"`);
        lines.push(
            '# the index may be empty or behind — `blong-dev memory index --semantic` fills it',
        );
        lines.push(`# bank ${context.bank} at ${context.url}`);
        return lines;
    }

    hits.forEach((hit, position) => {
        lines.push(rule(`${position + 1}/${hits.length}`));
        lines.push(describeHit(hit));
        const path = hitPath(hit);
        if (path) lines.push(path);
        lines.push('');
        lines.push(...snippet(hit.text));
        lines.push('');
    });

    lines.push(`# memory search: ${hits.length} match(es) for "${query}"`);
    lines.push(`# bank ${context.bank} at ${context.url}`);
    return lines;
}
