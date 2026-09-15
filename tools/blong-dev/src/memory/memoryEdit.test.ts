/**
 * Unit tests for the memory-file writer (`memoryEdit.ts`).
 *
 * Every edit is a line splice on the parsed document, so the cases that matter
 * are insert placement (including a section that does not exist yet), removal,
 * and id allocation across a workspace.
 */

import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {test} from 'tap';

import {
    addManualItems,
    applyEntries,
    bodyLines,
    ensureDoc,
    entryLines,
    insertEntry,
    nextId,
    removeEntry,
    skeleton,
    writeDoc,
} from './memoryEdit.ts';
import {parseDoc, splitLines} from './memoryParse.ts';
import type {IMemoryDoc} from './memoryTypes.ts';

function docFrom(text: string, kind: IMemoryDoc['kind'] = 'friction', scope = 'root'): IMemoryDoc {
    return {path: '/tmp/x.md', kind, scope, lines: splitLines(text)};
}

/** A throwaway workspace with a rush.json, so areas resolve to real projects. */
function workspace(): string {
    const dir = mkdtempSync(join(tmpdir(), 'blong-memory-'));
    writeFileSync(
        join(dir, 'rush.json'),
        JSON.stringify({projects: [{packageName: 'x', projectFolder: 'core/x'}]}, null, 2),
    );
    return dir;
}

test('skeleton names the scope and the other one', async t => {
    const root = skeleton('friction', 'root');
    t.equal(root[0], '# Frictions', 'root H1');
    t.match(root.join('\n'), /Cross-cutting entries only/, 'root says what belongs elsewhere');
    t.ok(root.includes('## Open') && root.includes('## Resolved'), 'sections present');

    const pkg = skeleton('todo', 'core/blong-kukum');
    t.equal(pkg[0], '# Todo — core/blong-kukum', 'package H1 carries the scope');
    t.match(pkg.join('\n'), /repository-root memory/, 'package points at the root');
    t.end();
});

test('insertEntry appends to the named section and creates a missing one', async t => {
    const doc = docFrom('# Frictions\n\n## Open\n\n## Resolved\n');
    insertEntry(
        doc,
        'Resolved',
        entryLines(
            'F-001',
            'a thing',
            {date: '2026-01-01', area: 'cross-cutting', status: 'resolved'},
            ['Body.'],
        ),
    );

    const structure = parseDoc(doc.lines);
    t.equal(structure.entries.length, 1, 'one entry');
    t.equal(structure.entries[0]?.section, 'Resolved', 'placed in the requested section');
    t.equal(structure.entries[0]?.title, 'a thing', 'title from the heading');
    t.same(structure.entries[0]?.body, ['Body.'], 'body kept');
    t.same(structure.sections[0]?.entries, [], 'the other section is untouched');

    insertEntry(
        doc,
        'Superseded',
        entryLines(
            'F-002',
            'another',
            {date: '2026-01-02', area: 'cross-cutting', status: 'superseded'},
            [],
        ),
    );
    const grown = parseDoc(doc.lines);
    t.same(
        grown.sections.map(section => section.heading),
        ['Open', 'Resolved', 'Superseded'],
        'section appended',
    );
    t.equal(grown.entries[1]?.section, 'Superseded', 'entry in the new section');
    t.end();
});

test('removeEntry takes the whole entry out', async t => {
    const doc = docFrom(
        '# Frictions\n\n## Open\n\n### F-001 — a thing\n_2026-01-01 · cross-cutting · open_\n\nBody.\n',
    );
    const [entry] = parseDoc(doc.lines).entries;
    removeEntry(doc, entry!);
    t.equal(parseDoc(doc.lines).entries.length, 0, 'gone');
    t.equal(doc.lines.join('\n').includes('Body.'), false, 'body gone with it');
    t.end();
});

test('bodyLines wraps text and preserves a fenced block', async t => {
    const lines =
        bodyLines(`A paragraph long enough that it has to be wrapped somewhere sensible for review.

\`\`\`bash
blong-dev memory check --files a.md,b.md
\`\`\``);
    for (const line of lines) t.ok(line.length <= 100, 'within 100 columns');
    t.ok(lines.includes('```bash'), 'fence kept');
    t.end();
});

test('ensureDoc writes the skeleton with a current index, and nextId scans the workspace', async t => {
    const dir = workspace();
    t.teardown(() => rmSync(dir, {recursive: true, force: true}));

    const doc = ensureDoc(dir, 'core/x', 'friction');
    const text = readFileSync(doc.path, 'utf8');
    t.ok(existsSync(doc.path), 'file created');
    t.match(text, /^# Frictions — core\/x/, 'package title');
    t.match(text, /<!-- memory:index -->/, 'index block present');
    t.equal(nextId(dir, 'friction'), 'F-001', 'first id');

    insertEntry(
        doc,
        'Open',
        entryLines('F-001', 'first', {date: '2026-01-01', area: 'core/x', status: 'open'}, []),
    );
    writeDoc(doc);
    t.equal(nextId(dir, 'friction'), 'F-002', 'ids advance with the file');
    t.equal(nextId(dir, 'todo'), 'T-001', 'ids are per kind');
    t.end();
});

test('addManualItems puts the items in `## Manual`, above the entries', async t => {
    const doc = docFrom('', 'todo');
    doc.lines = skeleton('todo', 'root');
    insertEntry(
        doc,
        'Open',
        entryLines(
            'T-001',
            'a thing',
            {date: '2026-01-01', area: 'cross-cutting', status: 'open'},
            [],
        ),
    );

    addManualItems(doc, ['first item', 'second item']);
    writeDoc(doc);
    const text = readFileSync(doc.path, 'utf8');

    const manual = text.indexOf('## Manual');
    const first = text.indexOf('- [ ] first item');
    const second = text.indexOf('- [ ] second item');
    const open = text.indexOf('## Open');
    const index = text.indexOf('<!-- /memory:index -->');
    t.ok(index > 0 && manual > index, 'the manual section sits below the index');
    t.ok(first > manual && second > first, 'items follow their heading, in order');
    t.ok(open > second, 'and before the entries');
    t.match(text, /<!\-\- memory:index \-\->/, 'the index block is still intact');
    t.end();
});

test('addManualItems appends and survives a second call', async t => {
    const doc = docFrom('', 'todo');
    doc.lines = skeleton('todo', 'root');
    addManualItems(doc, ['one']);
    addManualItems(doc, ['two']);
    writeDoc(doc);

    const structure = parseDoc(readFileSync(doc.path, 'utf8').split('\n'));
    const manual = structure.sections.find(section => section.heading === 'Manual');
    t.ok(manual, 'section present');
    t.same(
        manual?.other.filter(line => line.startsWith('- [ ]')),
        ['- [ ] one', '- [ ] two'],
        'both items, in order, nothing lost',
    );
    t.end();
});

test('applyEntries groups a batch by file and numbers it in author order', async t => {
    const dir = workspace();
    t.teardown(() => rmSync(dir, {recursive: true, force: true}));

    const applied = applyEntries(dir, 'friction', [
        {
            title: 'root one',
            body: 'First.',
            area: 'cross-cutting',
            status: 'open',
            date: '2026-09-15',
        },
        {
            title: 'package one',
            body: 'Second.',
            area: 'core/x',
            status: 'resolved',
            date: '2026-09-15',
        },
        {title: 'root two', body: 'Third.', area: 'ci', status: 'open', date: '2026-09-15'},
    ]);

    t.equal(applied.length, 3, 'all three written');
    t.same(
        applied.map(entry => entry.id),
        ['F-001', 'F-002', 'F-003'],
        'ids in author order',
    );
    t.equal(applied[1]?.path, applied[0]?.path, 'both root areas share one file');
    t.not(applied[2]?.path, applied[0]?.path, 'the package entry has its own');

    const root = parseDoc(splitLines(readFileSync(applied[0]!.path, 'utf8')));
    t.equal(root.entries.length, 2, 'and the root file kept both of its entries');
    t.same(
        root.entries.map(entry => entry.title),
        ['root one', 'root two'],
        'in order',
    );

    const more = applyEntries(dir, 'friction', [
        {title: 'next', body: '', area: 'core/x', status: 'open', date: '2026-09-15'},
    ]);
    t.equal(more[0]?.id, 'F-004', 'a second batch continues the numbering');
    t.end();
});

test('applyEntries writes the manual list to the root document only', async t => {
    const dir = workspace();
    t.teardown(() => rmSync(dir, {recursive: true, force: true}));

    applyEntries(
        dir,
        'todo',
        [{title: 'a deferred thing', body: '', area: 'core/x', status: 'open', date: '2026-09-15'}],
        ['the user asked for this'],
    );

    const root = parseDoc(splitLines(readFileSync(join(dir, '.github/memory/todo.md'), 'utf8')));
    const manual = root.sections.find(section => section.heading === 'Manual');
    t.same(
        manual?.other.filter(line => line.startsWith('- [ ]')),
        ['- [ ] the user asked for this'],
        'root',
    );
    t.notMatch(
        readFileSync(join(dir, 'core/x/.github/memory/todo.md'), 'utf8'),
        /the user asked for this/,
        'not the package file',
    );

    const manualOnly = applyEntries(dir, 'todo', [], ['a second item']);
    t.equal(manualOnly.length, 0, 'a manual-only batch writes no entries');
    const after = readFileSync(join(dir, '.github/memory/todo.md'), 'utf8');
    t.match(after, /- \[ \] a second item/, 'but still writes the item');
    t.end();
});
