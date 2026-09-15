/**
 * Unit tests for the generated index (`memoryIndex.ts`).
 *
 * The index is the whole point of the format — an agent reads it instead of the
 * file — so these cases check that it lists *every* entry, groups by status and
 * stays byte-stable.
 */

import {test} from 'tap';

import {buildIndexLines, indexIsCurrent, withRefreshedIndex} from './memoryIndex.ts';
import {parseDoc, splitLines} from './memoryParse.ts';
import type {IMemoryEntry} from './memoryTypes.ts';

const entry = (id: string, status: string | null, area = 'core/x'): IMemoryEntry => ({
    id,
    title: `title of ${id}`,
    meta: status === null ? null : {date: '2026-01-01', area, status},
    body: [],
    start: 0,
    end: 0,
    section: 'Open',
});

test('buildIndexLines groups by status, in the order the kind lists them', async t => {
    const lines = buildIndexLines('friction', [
        entry('F-002', 'resolved'),
        entry('F-001', 'open'),
        entry('F-003', 'open'),
    ]);

    t.equal(lines[0], '<!-- memory:index -->', 'opens with the marker');
    t.equal(lines[lines.length - 1], '<!-- /memory:index -->', 'closes with the marker');
    const text = lines.join('\n');
    t.match(text, /open \(2\)/, 'open count first');
    t.ok(text.indexOf('open (2)') < text.indexOf('resolved (1)'), 'open before resolved');
    t.match(text, /- `F-001` · core\/x — title of F-001/, 'bullet carries id, area and title');
    t.equal(text.match(/- `F-/g)?.length, 3, 'every entry appears exactly once');
    t.end();
});

test('buildIndexLines surfaces an entry with no meta line instead of hiding it', async t => {
    const lines = buildIndexLines('friction', [entry('F-009', null)]);
    const text = lines.join('\n');
    t.match(text, /unparsed \(1\)/, 'an unparsed group is shown');
    t.match(text, /- `F-009`/, 'and the entry is still listed');
    t.end();
});

test('buildIndexLines counts the manual list for the todo kind', async t => {
    const text = buildIndexLines('todo', [entry('T-001', 'open', 'cross-cutting')], 46).join('\n');
    t.match(text, /manual \(46\)/, 'manual count is reported');
    t.match(text, /user-owned/, 'and marked as not to be touched');
    t.equal(
        buildIndexLines('friction', [entry('F-001', 'open')], 3)
            .join('\n')
            .includes('manual'),
        false,
        'only todo',
    );
    t.end();
});

test('withRefreshedIndex inserts the block before the first section', async t => {
    const lines = splitLines(
        ['# Todo', '', 'Work that is deferred.', '', '## Open', '', '- something'].join('\n'),
    );
    const updated = withRefreshedIndex(lines, parseDoc(lines), 'todo');
    const structure = parseDoc(updated);

    t.ok(structure.indexRange !== null, 'a block was inserted');
    t.ok(
        updated.indexOf('<!-- memory:index -->') < updated.indexOf('## Open'),
        'the index precedes the sections',
    );
    t.ok(
        updated.indexOf('Work that is deferred.') < updated.indexOf('<!-- memory:index -->'),
        'and follows the intro',
    );
    t.ok(indexIsCurrent(updated, structure, 'todo'), 'and is current straight away');
    t.end();
});

test('withRefreshedIndex replaces an existing block in place', async t => {
    const lines = splitLines(
        [
            '# Todo',
            '',
            '<!-- memory:index -->',
            'stale',
            '<!-- /memory:index -->',
            '',
            '## Open',
            '',
        ].join('\n'),
    );
    const updated = withRefreshedIndex(lines, parseDoc(lines), 'todo');
    t.equal(updated.includes('stale'), false, 'the old block is gone');
    t.ok(indexIsCurrent(updated, parseDoc(updated), 'todo'), 'the new block is current');
    t.same(
        updated,
        withRefreshedIndex(updated, parseDoc(updated), 'todo'),
        'refreshing twice is a no-op',
    );
    t.end();
});
