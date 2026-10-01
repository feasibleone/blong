/**
 * Unit tests for the entry-to-document mapping (`hindsightDocument.ts`).
 *
 * What matters is that a document describes exactly one entry — content, key and
 * filterable tags — because the server upserts on that key and a search filters on
 * those tags. An entry whose meta line is missing must degrade rather than throw,
 * since `check` is what reports malformed entries, not this path.
 */

import {test} from 'tap';

import {parseDoc, splitLines} from '../memoryParse.ts';
import type {IMemoryDoc} from '../memoryTypes.ts';
import {entryDocument, entryDocuments, isoDate, tagValue} from './hindsightDocument.ts';

const ROOT = '/tmp/ws';

function docFrom(text: string, kind: IMemoryDoc['kind'] = 'friction'): IMemoryDoc {
    return {
        path: `${ROOT}/.github/memory/${kind}.md`,
        kind,
        scope: 'root',
        lines: splitLines(text),
    };
}

const TWO_ENTRIES = [
    '# Frictions',
    '',
    '## Open',
    '',
    '### F-001 — first thing',
    '',
    '> _2026-01-02 · core/blong-browser · open_',
    '',
    'Body of the first entry.',
    'A second line of it.',
    '',
    '### F-002 — second thing',
    '',
    'Body with no meta line.',
    '',
].join('\n');

test('a document carries one entry, not its neighbours', async t => {
    const doc = docFrom(TWO_ENTRIES);
    const [first] = parseDoc(doc.lines).entries;

    const document = entryDocument(ROOT, doc, first!);
    t.equal(document.documentId, 'F-001', 'the entry id is the upsert key');
    t.match(document.content, /^### F-001 — first thing/, 'content opens with the heading');
    t.match(document.content, /Body of the first entry\./, 'content carries the body');
    t.match(
        document.content,
        /A second line of it\.$/,
        'content stops at the end of the entry body',
    );
    t.notMatch(document.content, /second thing/, 'the next entry is not swallowed');
    t.equal(document.timestamp, '2026-01-02T00:00:00Z', 'the entry date becomes a timestamp');
    t.end();
});

test('tags carry every dimension a search can filter on', async t => {
    const doc = docFrom(TWO_ENTRIES);
    const [first] = parseDoc(doc.lines).entries;

    const {tags, metadata, context} = entryDocument(ROOT, doc, first!);
    t.ok(tags.includes('memory'), 'every document is tagged as memory');
    t.ok(tags.includes('kind:friction'), 'kind');
    t.ok(tags.includes('id:F-001'), 'id');
    t.ok(tags.includes('area:core/blong-browser'), 'area');
    t.ok(tags.includes('status:open'), 'status');
    t.ok(
        tags.includes('path:.github/memory/friction.md'),
        'the path is a tag, because that is what a search result is rendered from',
    );

    t.equal(metadata['path'], '.github/memory/friction.md', 'the path is relative to the root');
    t.equal(metadata['date'], '2026-01-02', 'metadata keeps the date as written');
    t.equal(
        context,
        'friction entry F-001 in .github/memory/friction.md',
        'context names the entry',
    );
    t.end();
});

test('an entry with no meta line degrades instead of throwing', async t => {
    const doc = docFrom(TWO_ENTRIES);
    const [, second] = parseDoc(doc.lines).entries;

    const document = entryDocument(ROOT, doc, second!);
    t.equal(document.documentId, 'F-002');
    t.equal(document.timestamp, undefined, 'no date, no timestamp');
    t.notOk(
        document.tags.some(tag => tag.startsWith('area:') || tag.startsWith('status:')),
        'no area or status tag',
    );
    t.ok(document.tags.includes('kind:friction'), 'the kind is still known from the file');
    t.end();
});

test('entryDocuments skips the manual list, which is not made of entries', async t => {
    const doc = docFrom(
        [
            '# Todo',
            '',
            '## Manual',
            '',
            '- ask somebody about the thing',
            '- and about the other thing',
            '',
            '## Open',
            '',
            '### T-001 — a real entry',
            '',
            '> _2026-01-02 · cross-cutting · open_',
            '',
            'Body.',
            '',
        ].join('\n'),
        'todo',
    );

    const documents = entryDocuments(ROOT, [doc]);
    t.equal(documents.length, 1, 'only the real entry becomes a document');
    t.equal(documents[0]!.documentId, 'T-001');
    t.end();
});

test('isoDate only rewrites a bare date', async t => {
    t.equal(isoDate('2026-01-02'), '2026-01-02T00:00:00Z');
    t.equal(isoDate('2026-01-02T05:00:00Z'), '2026-01-02T05:00:00Z', 'a timestamp is left alone');
    t.equal(isoDate(undefined), undefined);
    t.end();
});

test('tagValue reads a prefixed tag back out', async t => {
    t.equal(tagValue(['memory', 'id:F-316'], 'id'), 'F-316');
    t.equal(tagValue(['memory'], 'id'), null, 'missing prefix is null, not empty');
    t.end();
});
