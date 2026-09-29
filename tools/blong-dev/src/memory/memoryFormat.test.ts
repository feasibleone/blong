/**
 * Unit tests for the memory-file wrapper (`memoryFormat.ts`).
 *
 * The wrapper is what keeps the files inside the repository's prettier width
 * without a separate formatting step, so the cases that matter are the ones
 * where re-wrapping would corrupt structure: fences, tables, the meta line and
 * inline code spans.
 */

import {test} from 'tap';

import {formatLines, renderLines, wrapText} from './memoryFormat.ts';

test('wrapText fills to the width and hangs the continuation', async t => {
    const lines = wrapText(`- ${'word '.repeat(30).trim()}`, '', '  ');
    t.ok(lines.length > 1, 'a long line wraps');
    t.ok(lines[0]?.startsWith('- word '), 'the first line keeps the marker');
    for (const line of lines) t.ok(line.length <= 100, `within 100 columns: ${line.length}`);
    for (const line of lines.slice(1))
        t.ok(line.startsWith('  '), 'continuation is indented by two');
    t.end();
});

test('wrapText never breaks inside an inline code span', async t => {
    const lines = wrapText('see `blong-dev memory check --files a.md,b.md` for the gate');
    t.ok(
        lines.join('\n').includes('`blong-dev memory check --files a.md,b.md`'),
        'span kept whole',
    );
    t.end();
});

test('wrapText never starts a line with what markdown reads as a block', async t => {
    // The wrap chose the break, so the wrap has to keep `#ccc` off the start of a
    // line — as a heading markdownlint reports MD018, as a list item MD031/MD032
    // (T-175). The colour literal is real: it is what the root friction file held.
    const lines = wrapText(`${'word '.repeat(18)}left the text to the dark theme's #ccc and on`);
    t.ok(lines.length > 1, 'it wrapped');
    for (const line of lines.slice(1)) {
        t.notOk(
            /^(?:[-*+>|]|#{1,6}[^#\s]|\d+[.)])/.test(line),
            `continuation does not open a block: ${line}`,
        );
    }
    t.equal(lines.join(' '), `${'word '.repeat(18)}left the text to the dark theme's #ccc and on`);
    t.end();
});

test('wrapText keeps an emphasis span on one line and rewrites asterisks', async t => {
    const lines = wrapText(`${'filler '.repeat(30)}_two words here_ tail`);
    t.ok(lines.join('\n').includes('_two words here_'), 'an emphasis span is not split');

    t.same(
        wrapText('the goal is met in *identity* and so on'),
        ['the goal is met in _identity_ and so on'],
        'asterisk emphasis becomes underscore emphasis (MD049)',
    );
    t.same(wrapText('this is **bold** text'), ['this is **bold** text'], 'bold untouched');
    t.same(
        wrapText('the globs *.test.ts and **/*.ts stay'),
        ['the globs *.test.ts and **/*.ts stay'],
        'a glob is not emphasis',
    );
    t.same(
        wrapText('run `git log --oneline *stars*` now'),
        ['run `git log --oneline *stars*` now'],
        'a code span keeps its own characters',
    );
    t.end();
});

test("formatLines keeps the user's own Manual section verbatim", async t => {
    // The tool does not own this section (the check exempts it), so a format pass
    // must not re-flow the items into one paragraph — which is what it did once.
    const input = [
        '## Manual',
        '',
        '- F-241 - `blong-dev memory` auto-format',
        '- T-172',
        '  a wrapped note of the author',
        '',
        '## Open',
    ];
    t.same(formatLines(input), input, 'untouched');
    t.end();
});

test('formatLines leaves fences, tables, headings and the meta line alone', async t => {
    const input = [
        '# Frictions — core/x',
        '',
        '```bash',
        'echo "a line long enough that a wrapper that ignored fences would have reflowed it badly"',
        '```',
        '',
        '| a | b |',
        '| --- | --- |',
        '',
        '_2026-01-01 · core/x · open_',
    ];
    t.same(formatLines(input), input, 'verbatim by construction');
    t.end();
});

test('formatLines joins pre-wrapped prose and re-fills it', async t => {
    const input = [
        'A paragraph that',
        'was already wrapped',
        'mid sentence somewhere the wrapper would never choose to break, which is the point of it',
    ];
    const output = formatLines(input);
    t.ok(output.length <= input.length, 'at least as few lines');
    t.equal(output.join(' '), input.join(' '), 'no word is lost');
    for (const line of output) t.ok(line.length <= 100, 'within 100 columns');
    t.end();
});

test('formatLines keeps blank lines inside a fence', async t => {
    const input = ['```', 'first', '', '', 'second', '```'];
    t.same(formatLines(input), input, 'fence content is content');
    t.equal(
        renderLines(input),
        `${input.join('\n')}\n`,
        'rendered with exactly one trailing newline',
    );
    t.end();
});

test('renderLines collapses blank runs outside fences only', async t => {
    t.same(renderLines(['a', '', '', '', 'b']), ['a', '', 'b'].join('\n') + '\n', 'run collapsed');
    t.same(
        renderLines(['```', 'a', '', '', 'b', '```', '', '', '']),
        ['```', 'a', '', '', 'b', '```'].join('\n') + '\n',
        'fence preserved, trailing blanks dropped',
    );
    t.end();
});
