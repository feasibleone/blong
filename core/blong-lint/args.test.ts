/**
 * Unit tests for the lint command line (args.ts) and the path checks the CLI
 * relies on (`missingFiles` / `lintable` in index.ts).
 *
 * These exist because `blong-dev lint --files` used to read a comma-joined list as
 * one non-existent path and print a green tick over nothing at all (F-327), and
 * because this package declared a `ci-test` that had no test files — so the path
 * validation is the first thing here worth pinning down.
 */

import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import t from 'tap';

import {parseLintArgs} from './args.ts';
import {checkable, missingFiles} from './index.ts';

t.test('every spelling of a path list produces the same files', t => {
    const expected = ['a.md', 'b.ts'];
    t.same(parseLintArgs(['a.md', 'b.ts']).files, expected, 'bare paths');
    t.same(parseLintArgs(['--files', 'a.md,b.ts']).files, expected, '--files with a comma list');
    t.same(parseLintArgs(['--files=a.md,b.ts']).files, expected, '--files=value');
    t.same(
        parseLintArgs(['--files', 'a.md', '--files', 'b.ts']).files,
        expected,
        'the flag repeated',
    );
    t.same(
        parseLintArgs(['--files', 'a.md,b.ts', '--files', 'b.ts']).files,
        ['a.md', 'b.ts'],
        'a path named twice stays one path — the ✓ count must not lie',
    );
    t.same(
        parseLintArgs(['--files', ' a.md , b.ts ']).files,
        expected,
        'surrounding space is trimmed',
    );
    t.end();
});

t.test('--fix is a switch, not a path', t => {
    const parsed = parseLintArgs(['--fix', 'a.md']);
    t.equal(parsed.fix, true, 'the switch is read');
    t.same(parsed.files, ['a.md'], 'and the path beside it survives');
    t.same(parsed.problems, [], 'with nothing to report');
    t.equal(parseLintArgs(['a.md']).fix, false, 'absent means no repair');
    t.end();
});

t.test('an argument the command cannot honour is refused, never read as a path', t => {
    t.match(
        parseLintArgs(['--verbose']).problems,
        ['unknown option "--verbose"'],
        'an unknown option is named',
    );
    t.same(parseLintArgs(['--verbose']).files, [], 'and is not treated as a file');
    t.match(
        parseLintArgs(['--files']).problems,
        [/--files needs a value/],
        'a --files with nothing after it',
    );
    t.match(
        parseLintArgs(['--files', '--fix']).problems,
        [/--files needs a value/],
        'a --files whose value would be another flag',
    );
    t.same(parseLintArgs([]).problems, [], 'no arguments is the whole-package run, not a problem');
    t.end();
});

t.test('lintable names the paths a tool would actually read', t => {
    for (const file of ['a.ts', 'a.tsx', 'a.mts', 'a.js', 'a.mjs', 'a.md']) {
        t.equal(checkable(file), true, `${file} is read by at least one tool`);
    }
    for (const file of ['a.txt', 'a.png', 'a.json', 'README']) {
        t.equal(checkable(file), false, `${file} is read by none — a run over only this is empty`);
    }
    t.end();
});

t.test('missingFiles names what is absent and keeps what is not', t => {
    const dir = mkdtempSync(join(tmpdir(), 'blong-lint-args-'));
    t.teardown(() => rmSync(dir, {recursive: true, force: true}));
    writeFileSync(join(dir, 'here.md'), '# here\n');

    t.same(missingFiles(dir, ['here.md']), [], 'an existing path is not reported');
    t.same(missingFiles(dir, ['gone.md']), ['gone.md'], 'a path that is not there is');
    t.same(
        missingFiles(dir, ['here.md', 'gone.md']),
        ['gone.md'],
        'and only that one — the list is not all-or-nothing',
    );
    t.end();
});
