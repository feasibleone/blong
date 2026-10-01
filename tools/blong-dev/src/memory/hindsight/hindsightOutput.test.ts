/**
 * Unit tests for the search renderer (`hindsightOutput.ts`).
 *
 * The output is read by an agent and by a person, so the invariant worth testing
 * is that a block is unambiguous: a labelled rule, the entry's identity and score,
 * its path, and text that never exceeds the repository's line width. Empty results
 * must not read as failure.
 */

import {test} from 'tap';

import {MAX_LINE_LENGTH} from '../memoryTypes.ts';
import {formatSearchResults} from './hindsightOutput.ts';
import type {IHindsightHit} from './hindsightStore.ts';

const CONTEXT = {bank: 'blong', url: 'http://localhost:8888'};

function hit(overrides: Partial<IHindsightHit> = {}): IHindsightHit {
    return {
        text: 'Body of the entry.',
        score: 0.0006,
        similarity: 0.642,
        documentId: 'F-316',
        tags: [
            'memory',
            'kind:friction',
            'id:F-316',
            'area:core/blong-browser',
            'status:open',
            'path:core/blong-browser/.github/memory/friction.md',
        ],
        context: null,
        type: 'world',
        ...overrides,
    };
}

test('a block carries the rule, the identity, the path and the text', async t => {
    const lines = formatSearchResults([hit()], 'connection pool', CONTEXT);

    t.match(lines[0]!, /^--- 1\/1 -+$/, 'labelled rule opens the block');
    t.equal(lines[1], 'F-316 · friction · open · similarity 0.642', 'identity and similarity');
    t.equal(
        lines[2],
        'core/blong-browser/.github/memory/friction.md',
        'the path the entry lives at',
    );
    t.equal(lines[3], '', 'blank line before the text');
    t.equal(lines[4], 'Body of the entry.', 'the retained text');
    t.match(lines.at(-2)!, /^# memory search: 1 match\(es\) for "connection pool"$/, 'summary');
    t.equal(lines.at(-1), '# bank blong at http://localhost:8888', 'where it came from');
    t.end();
});

test('a missing similarity is omitted rather than printed as null', async t => {
    const lines = formatSearchResults([hit({similarity: null})], 'pool', CONTEXT);
    t.equal(lines[1], 'F-316 · friction · open', 'no similarity segment');
    t.end();
});

test('a documentation page is identified by its own type, not the unit type', async t => {
    const lines = formatSearchResults(
        [
            hit({
                documentId: 'doc-patterns-memory',
                tags: [
                    'type:documentation',
                    'stability:stable',
                    'tier:patterns',
                    'path:docs/blong/docs/patterns/memory.md',
                ],
            }),
        ],
        'memory files',
        CONTEXT,
    );
    t.equal(
        lines[1],
        'doc-patterns-memory · documentation · similarity 0.642',
        'the page id and its type, with no kind and no status',
    );
    t.equal(lines[2], 'docs/blong/docs/patterns/memory.md', 'and the file it came from');
    t.end();
});

test('a result the CLI cannot identify still renders', async t => {
    const lines = formatSearchResults(
        [hit({tags: [], documentId: null, type: null, score: null, similarity: null})],
        'pool',
        CONTEXT,
    );
    t.equal(lines[1], '(unrecognised result)', 'says so instead of printing an empty line');
    t.end();
});

test('long text wraps at the repository line width', async t => {
    const words = Array.from({length: 60}, (_, index) => `word${index}`);
    const lines = formatSearchResults([hit({text: words.join(' ')})], 'pool', CONTEXT);
    for (const line of lines) {
        t.ok(line.length <= MAX_LINE_LENGTH, `"${line.slice(0, 20)}…" is within the width`);
    }
    t.end();
});

test('blank lines inside a snippet survive the wrap', async t => {
    const lines = formatSearchResults(
        [hit({text: 'First part.\n\nSecond part.'})],
        'pool',
        CONTEXT,
    );
    const start = lines.indexOf('First part.');
    t.equal(lines[start + 1], '', 'paragraph break kept');
    t.equal(lines[start + 2], 'Second part.');
    t.end();
});

test('no results points at the backfill, not at a failure', async t => {
    const lines = formatSearchResults([], 'nothing at all', CONTEXT);
    t.equal(lines.length, 3);
    t.match(lines[0]!, /no match for "nothing at all"/);
    t.match(lines[1]!, /memory index --semantic/, 'the hint names the repair');
    t.end();
});
