import t from 'tap';

import {markdownBlocksOf, markdownPending} from './markdownBlocks.ts';

/**
 * The fence splitter (`@@T-799`).
 *
 * The one behaviour worth pinning is the incomplete case: the page receives a delta at a time, and a
 * fence that has opened but not closed must be drawn as text rather than half-rendered as a diagram.
 */

t.test('prose, a diagram and code are three blocks, in order', async t => {
    const blocks = markdownBlocksOf(
        [
            '# Result',
            '',
            '```mermaid',
            'graph TD; a-->b',
            '```',
            '',
            '```ts',
            'const a = 1;',
            '```',
        ].join('\n'),
    );
    t.same(
        blocks.map(block => block.kind),
        ['markdown', 'mermaid', 'code'],
        'the message splits where its fences are',
    );
    t.equal(
        (blocks[0] as {text: string}).text,
        '# Result\n',
        'the prose keeps what came before the fence',
    );
    t.equal((blocks[1] as {text: string}).text, 'graph TD; a-->b', 'the diagram keeps its lines');
    t.equal((blocks[2] as {language: string}).language, 'ts', 'and the code keeps its language');
});

t.test('an unterminated fence is pending, not a diagram', async t => {
    const blocks = markdownBlocksOf(['text', '```mermaid', 'graph TD; a--'].join('\n'));
    t.equal(blocks.length, 2, 'the prose and the open fence');
    t.equal(blocks[1]?.kind, 'pending', 'the fence is held rather than rendered');
    t.equal(
        (blocks[1] as {language: string}).language,
        'mermaid',
        'and still knows what it will be',
    );
    t.equal(markdownPending(['```mermaid', 'graph TD; a--'].join('\n')), true, 'the page is told');
});

t.test('a fence is closed only by its own marker', async t => {
    const blocks = markdownBlocksOf(['~~~ts', 'const a = 1;', '```'].join('\n'));
    t.equal(blocks[0]?.kind, 'pending', 'a different marker does not close it');
});

t.test('a fence without a language is plain code', async t => {
    const blocks = markdownBlocksOf(['```', 'plain', '```'].join('\n'));
    t.equal(blocks[0]?.kind, 'code', 'it is still code');
    t.equal(
        (blocks[0] as {language: string}).language,
        'text',
        'named text, so the highlighter skips it',
    );
});

t.test('a message with no fences is one prose block', async t => {
    const blocks = markdownBlocksOf('| a | b |\n| - | - |\n| 1 | 2 |');
    t.equal(blocks.length, 1, 'nothing to split');
    t.equal(blocks[0]?.kind, 'markdown', 'and it is prose, table and all');
    t.equal(markdownPending('| a |'), false, 'with nothing pending');
});
