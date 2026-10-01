/**
 * Unit tests for the tool-output parsers in index.ts.
 *
 * A parser that reads a real diagnostic as "nothing to report" is worse than a
 * missing check, because the run then prints a green tick while a tool behind it
 * failed — which is exactly what markdownlint's multi-segment rule ids did
 * (`MD041/first-line-heading/first-line-h1`), so that shape is pinned here.
 */

import t from 'tap';

import {parseMarkdownlint} from './index.ts';

t.test('parseMarkdownlint reads a two-segment rule id', t => {
    const diagnostics = parseMarkdownlint(
        'docs/a.md:12:3 error MD013/line-length Line length [Expected: 100; Actual: 140]',
    );
    t.equal(diagnostics.length, 1, 'one issue');
    t.equal(diagnostics[0]!.file, 'docs/a.md', 'the file is read');
    t.equal(diagnostics[0]!.line, 12, 'the line is read');
    t.equal(diagnostics[0]!.column, 3, 'the column is read');
    t.equal(diagnostics[0]!.rule, 'MD013/line-length', 'the rule keeps both segments');
    t.equal(diagnostics[0]!.severity, 'error', 'the severity is read');
    t.equal(diagnostics[0]!.tool, 'markdown', 'and it is attributed to markdown');
    t.end();
});

t.test('parseMarkdownlint reads a three-segment rule id', t => {
    const diagnostics = parseMarkdownlint(
        'tmp/a.md:1 error MD041/first-line-heading/first-line-h1 First line in a file should be a top-level heading [Context: "a mistyped wurd"]',
    );
    t.equal(diagnostics.length, 1, 'the issue is not dropped');
    t.equal(
        diagnostics[0]!.rule,
        'MD041/first-line-heading/first-line-h1',
        'the whole rule id survives',
    );
    t.equal(diagnostics[0]!.line, 1, 'the line is read without a column');
    t.equal(diagnostics[0]!.column, undefined, 'and the column stays absent rather than wrong');
    t.end();
});

t.test('parseMarkdownlint reads the summary and the progress lines as nothing', t => {
    const chatter = [
        'markdownlint-cli2 v0.23.2 (markdownlint v0.41.1)',
        'Finding: docs/a.md',
        'Linting: 1 file',
        'Summary: 1 issue in 1 file',
        '',
    ].join('\n');
    t.same(parseMarkdownlint(chatter), [], 'a run with no issue line yields no diagnostics');
    t.same(parseMarkdownlint(''), [], 'and so does no output at all');
    t.end();
});
