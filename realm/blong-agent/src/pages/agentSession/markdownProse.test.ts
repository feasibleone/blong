import t from 'tap';

import {inlineSpansOf, proseBlocksOf} from './markdownProse.ts';

/**
 * The prose reader (`@@T-799`).
 *
 * The page renders what this returns, so the cases pinned here are the ones a transcript actually
 * carries: a heading, a list, a table, a quote, inline code and emphasis — and a link whose target
 * the page refuses to follow.
 */

t.test('a heading, a paragraph and a list are three blocks', async t => {
    const blocks = proseBlocksOf(
        ['## Result', '', 'Two files changed.', '', '- one', '- two'].join('\n'),
    );
    t.same(
        blocks.map(block => block.kind),
        ['heading', 'paragraph', 'list'],
        'each block is what it says',
    );
    t.equal((blocks[0] as {level: number}).level, 2, 'the heading keeps its level');
    const list = blocks[2] as {ordered: boolean; items: unknown[]};
    t.equal(list.ordered, false, 'a bullet list is unordered');
    t.equal(list.items.length, 2, 'and keeps both items');
});

t.test('a numbered list is ordered', async t => {
    const blocks = proseBlocksOf(['1. first', '2. second'].join('\n'));
    t.equal((blocks[0] as {ordered: boolean}).ordered, true, 'numbers are an ordered list');
});

t.test('a table is a header and its rows', async t => {
    const blocks = proseBlocksOf(
        ['| file | lines |', '| ---- | ----- |', '| a.ts | 10    |', '| b.ts | 4     |'].join('\n'),
    );
    const table = blocks[0] as {kind: string; header: unknown[]; rows: unknown[][]};
    t.equal(table.kind, 'table', 'the divider makes it a table');
    t.equal(table.header.length, 2, 'two columns');
    t.equal(table.rows.length, 2, 'and two rows');
});

t.test('a table without a divider is prose', async t => {
    const blocks = proseBlocksOf('| just | text |');
    t.equal(blocks[0]?.kind, 'paragraph', 'nothing claims a table that is not one');
});

t.test('inline code keeps its markers literal', async t => {
    const spans = inlineSpansOf('write `_not italic_` here');
    t.same(
        spans.map(span => span.kind),
        ['text', 'code', 'text'],
        'the code span is one span',
    );
    t.equal(spans[1]?.text, '_not italic_', 'and its text is what was written');
});

t.test('bold and italic are their own spans', async t => {
    const spans = inlineSpansOf('**bold** and _italic_');
    t.same(
        spans.map(span => span.kind),
        ['strong', 'text', 'em'],
        'both are recognised',
    );
});

t.test('a link to the web is kept, and anything else is not offered', async t => {
    const web = inlineSpansOf('[docs](https://example.test/x)');
    t.equal(web[0]?.kind, 'link', 'an https target is a link');
    const script = inlineSpansOf('[click](javascript:alert(1))');
    t.equal(script[0]?.kind, 'text', 'a javascript target keeps its label and loses the link');
    t.equal(script[0]?.text, 'click', 'and the reader still sees the words');
});

t.test('a quote is its own block', async t => {
    const blocks = proseBlocksOf(['> the build is red', '> on main'].join('\n'));
    t.equal(blocks[0]?.kind, 'quote', 'two quoted lines are one quote');
    t.same(
        (blocks[0] as {spans: Array<{text: string}>}).spans.map(span => span.text),
        ['the build is red on main'],
        'joined into one line',
    );
});
