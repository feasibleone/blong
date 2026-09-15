/**
 * Unit tests for the legacy converter (`memoryMigrate.ts`).
 *
 * The shapes under test are the ones the three root files actually use: bold
 * bullet leads, plain bullets, prose paragraphs, `Resolved by … (date):` group
 * labels, dated topic headings and the legacy manual marker.
 */

import {test} from 'tap';

import {deriveTitle, migrateLegacy, parseBlameDates, parseDropList} from './memoryMigrate.ts';
import {splitLines} from './memoryParse.ts';

const BASE = {kind: 'friction' as const, defaultArea: 'cross-cutting', defaultDate: '2026-09-15'};

const SOURCE = `# Frictions

This document is a list of frictions.

## List of resolved frictions

Resolved by the "parity audit wrapped-title fix" pass (2026-09-15):

- **A substring audit breaks when prettier wraps the call.** The audit searched the raw source, so
  the lesson is to allow for formatting.
- **Polling for pixels cost four approaches.** Worked around by loading the page in the browser.

## MySQL connection-lost retry (2026-08-21)

- **The connection pool drops idle clients.** core/blong-gogo retries the builder only.

A paragraph that has no bullet in front of it, which is how four sections were written.
`;

test('migrateLegacy converts bold leads, plain bullets and prose', async t => {
    const result = migrateLegacy(splitLines(SOURCE), BASE);

    t.same(
        result.entries.map(entry => entry.title),
        [
            'A substring audit breaks when prettier wraps the call',
            'Polling for pixels cost four approaches',
            'The connection pool drops idle clients',
            'A paragraph that has no bullet in front of it, which is how four sections were',
        ],
        'one entry per block, bold text as the title, a long paragraph summarised',
    );

    t.match(
        result.entries[0]?.body.join(' '),
        /allow for formatting/,
        'the rest of the bullet is the body',
    );
    t.equal(result.entries[0]?.status, 'resolved', 'status from the section heading');
    t.equal(result.entries[0]?.date, '2026-09-15', 'date from the group label');
    t.equal(result.entries[2]?.area, 'core/blong-gogo', 'area from the text');
    t.equal(result.entries[2]?.areaSource, 'text', 'and says so');
    t.equal(result.entries[2]?.date, '2026-08-21', 'date from the topic heading');
    t.equal(result.entries[3]?.area, 'cross-cutting', 'the default area when nothing is named');
    t.ok(
        `${result.entries[3]?.title} ${result.entries[3]?.body.join(' ')}`.includes(
            'four sections were written',
        ),
        'a summarised title keeps the whole text across title and body',
    );
    t.equal(result.dropped.length, 0, 'nothing dropped');
    t.end();
});

test('migrateLegacy honours a drop list by source line', async t => {
    const lines = splitLines(SOURCE);
    const firstBullet = lines.findIndex(line => line.includes('A substring audit')) + 1;
    const result = migrateLegacy(lines, {...BASE, drop: new Set([firstBullet, firstBullet + 1])});

    t.equal(
        result.entries[0]?.title,
        'Polling for pixels cost four approaches',
        'the dropped entry is gone',
    );
    t.equal(result.dropped.length, 1, 'and reported');
    t.equal(result.dropped[0]?.reason, 'listed', 'with the reason');
    t.end();
});

test('migrateLegacy keeps a fenced block inside a bullet', async t => {
    const source = [
        '# Frictions',
        '',
        '## Open',
        '',
        '- **A command that needs escaping.** Run it as:',
        '',
        '  ```bash',
        '  grep -n "if (!route" x.ts',
        '  ```',
        '',
    ].join('\n');
    const result = migrateLegacy(splitLines(source), BASE);

    t.equal(result.entries.length, 1, 'one entry');
    t.ok(result.entries[0]?.body.join('\n').includes('```bash'), 'fence kept');
    t.ok(result.entries[0]?.body.join('\n').includes('if (!route'), 'and its content');
    t.end();
});

test('migrateLegacy collects the manual list from the legacy marker', async t => {
    const source = [
        '# Todo',
        '',
        '## List of incomplete tasks',
        '',
        '- stable keys',
        '- telemetry',
        '- ^^ Manual entries are above',
        '- CI report: `wanples` and `release-cd` define no `ci-test` script.',
        '',
    ].join('\n');
    const result = migrateLegacy(splitLines(source), {...BASE, kind: 'todo'});

    t.same(
        result.manual,
        ['- [ ] stable keys', '- [ ] telemetry'],
        'items above the marker are manual',
    );
    t.equal(result.entries.length, 1, 'the agent entry below it is converted');
    t.equal(result.entries[0]?.status, 'open', 'and is open');
    t.end();
});

test('migrateLegacy reads a ## Manual section and an area from a heading', async t => {
    const source = [
        '# Todo',
        '',
        '## Deferred — wood theme design-match (blong-browser, 2026-09-11)',
        '',
        '- **Habitat grid column pitch.** Container-driven, not a styling difference.',
        '',
        '## Manual',
        '',
        '- something only the user can decide',
        '',
    ].join('\n');
    const result = migrateLegacy(splitLines(source), {
        ...BASE,
        kind: 'todo',
        resolvePackage: name => (name === 'blong-browser' ? 'core/blong-browser' : null),
    });

    t.equal(
        result.entries[0]?.area,
        'core/blong-browser',
        'package name resolved from the heading',
    );
    t.equal(result.entries[0]?.areaSource, 'heading', 'reported as a heading decision');
    t.equal(result.entries[0]?.date, '2026-09-11', 'heading date');
    t.same(result.manual, ['- [ ] something only the user can decide'], 'manual section collected');
    t.end();
});

test('migrateLegacy reads an area heading that carries a trailing note', async t => {
    const source = [
        '# Todo',
        '',
        '## Deferred — wood theme design-match (blong-browser, 2026-09-11 / updated 2026-09-12)',
        '',
        '- **Habitat column pitch.** Container-driven, not a styling difference.',
        '',
    ].join('\n');
    const result = migrateLegacy(splitLines(source), {
        ...BASE,
        kind: 'todo',
        resolvePackage: name => (name === 'blong-browser' ? 'core/blong-browser' : null),
    });

    t.equal(
        result.entries[0]?.area,
        'core/blong-browser',
        'the note after the date does not break it',
    );
    t.end();
});

test('migrateLegacy repairs an area that is a stale path', async t => {
    const source = [
        '# Todo',
        '',
        '## Open',
        '',
        '- **Enable the retry.** Set it in `core/blong-int-sql/mysql/adapter/sql.ts`.',
        '',
    ].join('\n');
    const result = migrateLegacy(splitLines(source), {
        ...BASE,
        kind: 'todo',
        resolveArea: () => 'test/blong-int-sql',
    });

    t.equal(result.entries[0]?.area, 'test/blong-int-sql', 'the resolver decides the area');
    t.end();
});

test('migrateLegacy reports an unknown area instead of writing it', async t => {
    const source = [
        '# Todo',
        '',
        '## Open',
        '',
        '- **Something.** Mentioned in `ext/nowhere/file.ts`.',
        '',
    ].join('\n');
    const result = migrateLegacy(splitLines(source), {
        ...BASE,
        kind: 'todo',
        resolveArea: () => null,
    });

    t.equal(result.entries[0]?.area, 'cross-cutting', 'falls back to the default');
    t.ok(
        result.notes.some(note => note.includes('unknown area')),
        'and says so, so the dry run cannot hide it',
    );
    t.end();
});

test('migrateLegacy strips a topic prefix and uses it as the area', async t => {
    const source = [
        '# Todo',
        '',
        '## Open',
        '',
        '- (semantic-log) **Deferred by ruling: the leg sequence as the drift shape.** Drift compares the',
        '  ordered sequence of template refs.',
        '- (docs) `patterns/cli.md` is new and unlinked.',
        '',
    ].join('\n');
    const result = migrateLegacy(splitLines(source), {
        ...BASE,
        kind: 'todo',
        resolveTopic: topic =>
            topic === 'semantic-log' ? 'core/semantic-log' : topic === 'docs' ? 'docs' : null,
    });

    t.equal(
        result.entries[0]?.title,
        'Deferred by ruling: the leg sequence as the drift shape',
        'prefix dropped',
    );
    t.equal(result.entries[0]?.area, 'core/semantic-log', 'topic became the area');
    t.equal(result.entries[0]?.areaSource, 'text', 'reported as coming from the text');
    t.equal(result.entries[1]?.area, 'docs', 'a reserved topic maps to its reserved area');
    t.equal(
        result.entries[1]?.title,
        '`patterns/cli.md` is new and unlinked',
        'title from what follows',
    );
    t.end();
});

test('parseBlameDates maps every line to an author date', async t => {
    const blame = [
        'aaaa 1 1 1',
        'author-time 1757000000',
        '\tfirst line',
        'bbbb 2 2 1',
        'author-time 1758000000',
        '\tsecond line',
    ].join('\n');
    const dates = parseBlameDates(blame);

    t.equal(dates.size, 2, 'one entry per content line');
    t.match(dates.get(1) ?? '', /^\d{4}-\d{2}-\d{2}$/, 'a date, not a timestamp');
    t.not(dates.get(1), dates.get(2), 'later commits get later dates');
    t.end();
});

test('deriveTitle falls back to a summary and keeps the remainder in the body', async t => {
    const sentence = deriveTitle('A short sentence. Then more.');
    t.equal(sentence.title, 'A short sentence', 'trailing period dropped');
    t.equal(sentence.body, 'Then more.', 'the rest is the body');

    const long = `${'word '.repeat(30).trim()}`;
    const cut = deriveTitle(long);
    t.ok(cut.title.length <= 80, 'title stays within the limit');
    t.equal(`${cut.title} ${cut.body}`.trim(), long, 'title and body still hold the whole text');

    const wrapped = deriveTitle(
        '**A finding whose bold lead spans\ntwo source lines** because the author wrapped it.',
    );
    t.equal(wrapped.title, 'A finding whose bold lead spans two source lines', 'newlines collapse');
    t.equal(wrapped.body, 'because the author wrapped it.', 'the body follows');

    const span = deriveTitle(
        `**Keep \`a very long inline code span ${'x'.repeat(70)}\` out** of the way.`,
    );
    t.equal(span.title, 'Keep', 'an unfinished code span is dropped from the title');
    t.match(span.body, /^`a very long inline code span/, 'and kept in the body');

    const dotted = deriveTitle(
        'Enable `knex.retry` for the own adapter — only the shared one enables it.',
    );
    t.equal(
        dotted.title,
        'Enable `knex.retry` for the own adapter — only the shared one enables it',
        'a dotted identifier is not a sentence end',
    );

    const colon = deriveTitle(
        'A component keeps `cli: {logLevel: 1}` as boilerplate. Moving it needs a hook.',
    );
    t.equal(
        colon.title,
        'A component keeps `cli: {logLevel: 1}` as boilerplate',
        'a colon is not a sentence end',
    );
    t.equal(colon.body, 'Moving it needs a hook.', 'the next sentence is the body');
    t.end();
});

test('parseDropList reads single lines and ranges, ignoring comments', async t => {
    const dropped = parseDropList('# reviewed 2026-09-15\n12\n20-22\n\nnonsense\n');
    t.same(
        [...dropped].sort((a, b) => a - b),
        [12, 20, 21, 22],
        'lines expanded',
    );
    t.end();
});

test('migrateLegacy keeps a heading status only when the kind allows it', async t => {
    const source =
        '# Decisions\n\n## Resolved questions (2026-01-02)\n\n- We keep the union in one route.\n';
    const result = migrateLegacy(splitLines(source), {
        ...BASE,
        kind: 'decision',
        defaultArea: 'cross-cutting',
    });
    t.equal(
        result.entries[0]?.status,
        'active',
        'a decision is active or superseded, never resolved',
    );

    const frictions = migrateLegacy(splitLines(source), {
        ...BASE,
        kind: 'friction',
        defaultArea: 'cross-cutting',
    });
    t.equal(frictions.entries[0]?.status, 'resolved', 'the same heading still resolves a friction');
    t.end();
});
