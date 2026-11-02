import {test} from 'tap';

import {slackChunks, slackMarkdown, splitSlackText} from './markdown.ts';

/**
 * The dialect, pinned.
 *
 * These are the shapes a model actually emits; each one is a reading a person would otherwise see as
 * punctuation (`@@D-730`).
 */
test('a model answer reads as Slack text', async t => {
    t.equal(
        slackMarkdown('**bold** and *italic*'),
        '*bold* and _italic_',
        'emphasis swaps markers',
    );
    t.equal(
        slackMarkdown('__bold__ and _italic_'),
        '*bold* and _italic_',
        'the other spelling too',
    );
    t.equal(slackMarkdown('~~gone~~'), '~gone~', 'strike is one tilde');
    t.equal(slackMarkdown('***both***'), '*_both_*', 'bold and italic at once');

    t.equal(slackMarkdown('# Title'), '*Title*', 'a heading is a bold line');
    t.equal(slackMarkdown('### Deep'), '*Deep*', 'of any depth');

    t.equal(
        slackMarkdown('[the docs](https://example.com/a)'),
        '<https://example.com/a|the docs>',
        'a link keeps its text',
    );
    t.equal(
        slackMarkdown('![a diagram](https://example.com/d.png)'),
        '_a diagram_ <https://example.com/d.png>',
        'an image becomes a link, because a text message cannot carry one',
    );

    t.equal(slackMarkdown('- one\n- two'), '• one\n• two', 'a list becomes bullets');
    t.equal(slackMarkdown('  - nested'), '   • nested', 'and indents with its depth');
    t.equal(slackMarkdown('1. first'), '1. first', 'an ordered list keeps its numbers');

    t.equal(slackMarkdown('> quoted'), '> quoted', 'a quote is a quote');

    t.equal(
        slackMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |'),
        '```\n| a | b |\n| 1 | 2 |\n```',
        'a table keeps its columns inside a code block',
    );

    t.equal(
        slackMarkdown('Use `a * b` here'),
        'Use `a * b` here',
        'what is inside a code span is left alone',
    );
    t.equal(
        slackMarkdown('```\nconst a = **b**;\n```'),
        '```\nconst a = **b**;\n```',
        'and what is inside a fence is left alone',
    );

    t.equal(
        slackMarkdown('a < b & c > d'),
        'a &lt; b &amp; c &gt; d',
        'the syntax characters escape',
    );

    t.equal(slackMarkdown('---'), '———', 'a rule becomes a rule');
    t.equal(slackMarkdown(''), '', 'nothing stays nothing');
});

test('a long answer is cut where a message can carry it', async t => {
    const paragraph = 'A sentence that repeats itself so the total has some length to it. ';
    const long = `${paragraph.repeat(60)}\n\nSecond part.`;

    const converted = slackMarkdown(long);
    const pieces = splitSlackText(converted, 1_000);
    t.ok(pieces.length > 1, 'it is split');
    t.ok(
        pieces.every(piece => piece.length <= 1_000),
        'no piece is longer than the limit',
    );
    t.equal(
        pieces.join('').replaceAll('\n', ''),
        converted.replaceAll('\n', ''),
        'nothing is lost',
    );

    t.equal(splitSlackText('', 100).length, 0, 'an empty text is no message');
    t.same(slackChunks('**a**', 100), ['*a*'], 'the pair converts and splits in one step');
});
