/**
 * The markdown rules the memory checker runs, and the line where "content after a list" begins.
 *
 * A wrapped list item continues on an indented line, which is the shape every memory body is written
 * in. Read as content after the list, it made this checker demand a blank line that markdownlint
 * then reports as MD012 — so no ending of a file satisfied both gates (F-709).
 */

import {test} from 'tap';

import {checkMarkdown} from './memoryMarkdown.ts';

const rules = (lines: string[]): string[] => checkMarkdown(lines).map(problem => problem.rule);

test('a list whose last item wraps needs no blank line below it', t => {
    const lines = [
        '## Retired',
        '',
        '- T-526 — retired 2026-11-10 — The post is written from another entry; a real bot is not',
        '  available',
    ];
    t.same(
        rules(lines),
        [],
        'the continuation line belongs to the item, not to a paragraph after it',
    );
    t.end();
});

test('a wrapped item does not break the block apart', t => {
    const lines = [
        '## Retired',
        '',
        '- T-526 — retired 2026-11-10 — The post is written from another entry; a real bot is not',
        '  available',
        '- T-623 — retired 2026-11-10 — Viber cannot be exercised without a paid account',
    ];
    t.same(rules(lines), [], 'the second item needs no blank line above it');
    t.end();
});

test('a paragraph after a list is still content after it', t => {
    const lines = ['- first', 'A sentence that follows the list', '', ''];
    t.ok(
        rules(lines).includes('MD031'),
        'an unindented line ends the list, so the list needs air below it',
    );
    t.end();
});

test('a list after a paragraph still needs air above it', t => {
    const lines = ['A sentence that opens the section', '- first', ''];
    t.ok(rules(lines).includes('MD032'), 'the same rule, the other way round');
    t.end();
});

test('an indented block after a list reads as the item it continues', t => {
    // Four spaces under an item is markdown's own indented code block, and the checker says so
    // rather than treating it as a paragraph (MD046) — but it is not content *after* the list
    // either, so no blank line is demanded between the item and its own block.
    const lines = ['- first', '', '    indented example', ''];
    const found = rules(lines);
    t.notOk(found.includes('MD031'), 'the item and its block are one thing');
    t.end();
});
