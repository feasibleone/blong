/**
 * Tests for the `ci` verb's argument handling and its staleness check.
 *
 * The flags are the whole interface a caller has: a verb, a way to name a run (`--pr`, `--run`,
 * `--sha`, `--branch`), and the three modifiers that change what is fetched. The bare run number is
 * the one worth pinning, because it is the shortest way to say "look at #622" and the easiest to
 * mistake for a verb.
 */
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'tap';

import {parseCiFlags, staleReport} from './ci.ts';

test('the verb and the flags are read from any order', t => {
    const flags = parseCiFlags(['failures', '--run', '622', '--full', '--json']);
    t.equal(flags.verb, 'failures', 'the verb');
    t.equal(flags.run, '622', 'a valued flag');
    t.equal(flags.full, true, 'an unvalued one');
    t.equal(flags.json, true, 'and another');

    const inline = parseCiFlags(['failures', '--pr=200', '--site=https://example.test']);
    t.equal(inline.pr, '200', 'a flag with `=`');
    t.equal(inline.site, 'https://example.test', 'and a URL, whose `=` must not split it twice');
    t.end();
});

test('a bare run number is the run, never a verb', t => {
    t.equal(parseCiFlags(['622']).run, '622', 'a number on its own');
    t.equal(parseCiFlags(['622']).verb, '', 'and the default verb is left to the caller');
    t.equal(
        parseCiFlags(['https://github.com/feasibleone/blong/actions/runs/38791173525']).run,
        '38791173525',
        'a run URL names the run by id',
    );
    t.end();
});

test('the modifiers default to the cheap answer', t => {
    const flags = parseCiFlags(['failures']);
    t.equal(flags.full, false, 'no artifact unless asked');
    t.equal(flags.write, false, 'nothing written');
    t.equal(flags.strict, false, 'exit code 0 whatever the verdict');
    t.end();
});

test('the verbs after the first are positional', t => {
    const flags = parseCiFlags(['history', 'blong-cli', '--limit', '5']);
    t.equal(flags.verb, 'history', 'the verb');
    t.same(flags.positional, ['blong-cli'], 'the package');
    t.equal(flags.limit, 5, 'and the limit is a number');
    t.end();
});

test('a stale local report is named, a current one is not', t => {
    const dir = mkdtempSync(join(tmpdir(), 'blong-ci-stale-'));
    try {
        t.equal(staleReport(dir, 622), undefined, 'no report, nothing to say');

        writeFileSync(
            join(dir, 'ci-report.md'),
            '## CI Summary\n\n**7 package(s)** — build #557\n',
        );
        t.same(
            staleReport(dir, 622),
            {file: 'ci-report.md', describesRun: 557},
            'an older build is reported',
        );
        t.equal(staleReport(dir, 557), undefined, 'the same build is not');
        t.equal(staleReport(dir, 556), undefined, 'nor is a build the file is ahead of');
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
    t.end();
});
