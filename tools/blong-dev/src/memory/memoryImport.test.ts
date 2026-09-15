/**
 * Unit tests for batch import parsing (`memoryImport.ts`).
 *
 * The batch is authored outside the CLI, so every shape a file could arrive in
 * has to end in either a usable plan or a problem the author can act on — never
 * in a half-written memory file.
 */

import {test} from 'tap';

import {duplicateEntries, entryKey, mergePlans, parseImport} from './memoryImport.ts';

const BASE = {today: '2026-09-15', source: 'batch.json'};

test('parseImport reads the object form and a bare array', async t => {
    const object = parseImport(
        'batch.json',
        JSON.stringify({
            kind: 'friction',
            entries: [
                {
                    title: 'A finding',
                    body: 'The body.',
                    area: 'core/blong-gogo',
                    status: 'resolved',
                    date: '2026-08-21',
                },
            ],
        }),
        BASE,
    );
    t.equal(object.kind, 'friction', 'kind from the file');
    t.equal(object.problems.length, 0, 'no problems');
    t.equal(object.entries[0]?.area, 'core/blong-gogo', 'area with the entry');
    t.equal(object.entries[0]?.body, 'The body.', 'body kept');

    const array = parseImport('batch.json', JSON.stringify([{title: 'Another', body: ''}]), {
        ...BASE,
        kind: 'todo',
        defaultArea: 'cross-cutting',
    });
    t.equal(array.kind, 'todo', 'kind from the options');
    t.equal(array.entries[0]?.area, 'cross-cutting', 'default area');
    t.equal(array.entries[0]?.status, 'open', 'first status of the kind');
    t.equal(array.entries[0]?.date, '2026-09-15', 'date falls back to today');
    t.equal(array.notes.length, 1, 'and says so');
    t.end();
});

test('parseImport reports what would stop a batch', async t => {
    const plan = parseImport(
        'batch.json',
        JSON.stringify({
            kind: 'decision',
            manual: ['not a todo'],
            entries: [
                {
                    title: `${'word '.repeat(20).trim()}`,
                    body: '',
                    area: 'cross-cutting',
                    status: 'active',
                    date: '2026-09-15',
                },
                {body: 'no title', area: 'cross-cutting'},
                {title: 'Bad status', body: '', area: 'cross-cutting', status: 'resolved'},
                {title: 'Bad date', body: '', area: 'cross-cutting', date: 'yesterday'},
                'Not an object',
                {title: 'Fine', body: '', area: 'cross-cutting'},
            ],
        }),
        BASE,
    );
    t.equal(plan.entries.length, 4, 'the usable entries are kept, in order');
    t.equal(plan.problems.length, 6, 'one problem per fault plus the manual one');
    t.match(plan.problems.join('\n'), /title is \d+ characters/, 'long title');
    t.match(plan.problems.join('\n'), /entry 2: no title/, 'missing title');
    t.match(
        plan.problems.join('\n'),
        /status "resolved" is not one of active, superseded/,
        'status of another kind',
    );
    t.match(plan.problems.join('\n'), /date "yesterday" is not YYYY-MM-DD/, 'bad date');
    t.match(plan.problems.join('\n'), /entry 5: expected an object/, 'non-object');
    t.match(
        plan.problems.join('\n'),
        /"manual" only applies to todo batches/,
        'manual on a decision batch',
    );
    t.equal(plan.entries[3]?.title, 'Fine', 'the valid entry survived');
    t.end();
});

test('parseImport survives malformed files', async t => {
    t.match(
        parseImport('bad.json', '{oops', BASE).problems.join(),
        /not valid JSON/,
        'broken JSON',
    );
    t.match(
        parseImport('bad.json', '{"entries": 3}', BASE).problems.join(),
        /expected an array/,
        'wrong shape',
    );
    t.match(
        parseImport('bad.json', '{"kind": "note", "entries": []}', BASE).problems.join(),
        /unknown kind "note"/,
        'unknown kind',
    );
    t.end();
});

test('mergePlans keeps one kind and collects everything', async t => {
    const first = parseImport('a.json', JSON.stringify([{title: 'One', body: ''}]), {
        ...BASE,
        kind: 'friction',
        defaultArea: 'cross-cutting',
    });
    const second = parseImport('b.json', JSON.stringify([{title: 'Two', body: ''}]), {
        ...BASE,
        kind: 'friction',
        defaultArea: 'cross-cutting',
    });
    const merged = mergePlans([first, second]);
    t.equal(merged.entries.length, 2, 'both batches');
    t.equal(merged.problems.length, 0, 'no problems');

    const mixed = mergePlans([first, {...second, kind: 'todo'}]);
    t.match(mixed.problems.join(), /mixed kinds in one import/, 'a kind change is refused');
    t.end();
});

test('duplicateEntries names what is already written, and what repeats', async t => {
    const batch = [
        {title: 'The pool drops idle clients', body: 'A body that was re-wrapped on disk.', area: 'core/x', status: 'open', date: '2026-09-15'},
        {title: 'A second finding', body: 'Its own body.', area: 'core/x', status: 'open', date: '2026-09-15'},
        {title: 'a second   finding', body: 'its OWN body.', area: 'core/x', status: 'open', date: '2026-09-15'},
        {title: 'Something new', body: 'Never written before.', area: 'core/x', status: 'open', date: '2026-09-15'},
    ];
    const existing = [
        {
            id: 'F-010',
            title: 'The pool drops idle clients',
            body: 'A body that was re-wrapped\non disk.',
        },
    ];

    const problems = duplicateEntries(batch, existing);
    t.equal(problems.length, 2, 'one already-written and one repeat');
    t.match(problems[0] ?? '', /entry 1: already written as F-010/, 'names the id it already has');
    t.match(problems[1] ?? '', /entry 3: repeats entry 2 of this batch/, 'names the earlier entry');
    t.notMatch(problems.join('\n'), /Something new/, 'a genuinely new entry is not flagged');
    t.equal(entryKey('A `title`', 'with\n*marks*'), entryKey('a title', 'with marks'), 'the key ignores case, markup and wrapping');
    t.end();
});
