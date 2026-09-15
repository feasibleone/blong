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
    for (const line of lines.slice(1)) t.ok(line.startsWith('  '), 'continuation is indented by two');
    t.end();
});

test('wrapText never breaks inside an inline code span', async t => {
    const lines = wrapText('see `blong-dev memory check --files a.md,b.md` for the gate');
    t.ok(lines.join('\n').includes('`blong-dev memory check --files a.md,b.md`'), 'span kept whole');
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
    t.equal(renderLines(input), `${input.join('\n')}\n`, 'rendered with exactly one trailing newline');
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
